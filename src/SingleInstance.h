#pragma once

#include <QObject>
#include <QString>
#include <QStringList>
#include <QLocalServer>
#include <QLocalSocket>

class SingleInstanceManager : public QObject {
    Q_OBJECT

public:
    explicit SingleInstanceManager(const QString &serverName, QObject *parent = nullptr);
    ~SingleInstanceManager() override;

    bool hasPreviousInstance();
    bool sendMessage(const QStringList &filePaths);

signals:
    void filesReceived(const QStringList &filePaths);

private slots:
    void onNewConnection();

private:
    QString m_serverName;
    QLocalServer *m_server{nullptr};
    bool m_isSecondary{false};
};
