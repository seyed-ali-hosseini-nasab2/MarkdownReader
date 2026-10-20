#include "SingleInstance.h"

#include <QJsonDocument>
#include <QJsonArray>
#include <QJsonValue>

#ifdef Q_OS_WIN
#include <windows.h>
#endif

SingleInstanceManager::SingleInstanceManager(const QString &serverName, QObject *parent)
    : QObject(parent), m_serverName(serverName) {
    QLocalSocket socket;
    socket.connectToServer(m_serverName);
    if (socket.waitForConnected(500)) {
        m_isSecondary = true;
    } else {
        m_isSecondary = false;
        QLocalServer::removeServer(m_serverName);
        m_server = new QLocalServer(this);
        connect(m_server, &QLocalServer::newConnection, this, &SingleInstanceManager::onNewConnection);
        m_server->listen(m_serverName);
    }
}

SingleInstanceManager::~SingleInstanceManager() {
    if (m_server) {
        m_server->close();
    }
}

bool SingleInstanceManager::hasPreviousInstance() {
    return m_isSecondary;
}

bool SingleInstanceManager::sendMessage(const QStringList &filePaths) {
    QLocalSocket socket;
    socket.connectToServer(m_serverName);
    if (!socket.waitForConnected(1000)) {
        return false;
    }

    QJsonArray array;
    for (const auto &path : filePaths) {
        array.append(path);
    }
    QJsonDocument doc(array);
    QByteArray data = doc.toJson(QJsonDocument::Compact);

#ifdef Q_OS_WIN
    // Allow the primary instance process to bring its window to the foreground
    AllowSetForegroundWindow(ASFW_ANY);
#endif

    socket.write(data);
    socket.flush();
    socket.waitForBytesWritten(1000);
    socket.disconnectFromServer();
    return true;
}

void SingleInstanceManager::onNewConnection() {
    if (!m_server) return;

    QLocalSocket *clientSocket = m_server->nextPendingConnection();
    if (!clientSocket) return;

    connect(clientSocket, &QLocalSocket::readyRead, this, [this, clientSocket]() {
        QByteArray data = clientSocket->readAll();
        if (data.isEmpty()) return;

        QJsonDocument doc = QJsonDocument::fromJson(data);
        if (doc.isArray()) {
            QStringList paths;
            for (const auto &val : doc.array()) {
                paths.append(val.toString());
            }
            emit filesReceived(paths);
        }
    });

    connect(clientSocket, &QLocalSocket::disconnected, clientSocket, &QLocalSocket::deleteLater);
}
