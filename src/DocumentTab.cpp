#include "DocumentTab.h"

#include <QVBoxLayout>
#include <QWebChannel>
#include <QFile>
#include <QFileInfo>
#include <QTextStream>
#include <QUrl>

DocumentTab::DocumentTab(QWidget *parent)
    : QWidget(parent),
      m_webView(new QWebEngineView(this)),
      m_bridge(new DocumentBridge(this)) {
    auto *layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(m_webView);

    auto *channel = new QWebChannel(this);
    channel->registerObject(QStringLiteral("bridge"), m_bridge);
    m_webView->page()->setWebChannel(channel);

    m_webView->setUrl(QUrl("qrc:/web/viewer.html"));

    connect(&m_fileWatcher, &QFileSystemWatcher::fileChanged, this, &DocumentTab::onFileSystemChanged);
}

bool DocumentTab::loadFile(const QString &filePath) {
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        return false;
    }

    QTextStream stream(&file);
    stream.setEncoding(QStringConverter::Utf8);
    QString content = stream.readAll();
    file.close();

    if (!m_filePath.isEmpty()) {
        m_fileWatcher.removePath(m_filePath);
    }

    m_filePath = filePath;
    m_fileWatcher.addPath(filePath);

    m_bridge->setMarkdown(content);
    emit fileLoaded(filePath);
    return true;
}

void DocumentTab::reload() {
    if (!m_filePath.isEmpty() && QFile::exists(m_filePath)) {
        loadFile(m_filePath);
    }
}

void DocumentTab::setTheme(const QString &theme) {
    if (m_bridge) {
        m_bridge->setTheme(theme);
    }
}

void DocumentTab::setZoomFactor(qreal factor) {
    m_zoomFactor = factor;
    if (m_webView) {
        m_webView->setZoomFactor(factor);
    }
}

qreal DocumentTab::zoomFactor() const {
    return m_zoomFactor;
}

QString DocumentTab::fileName() const {
    if (m_filePath.isEmpty()) {
        return "Untitled";
    }
    return QFileInfo(m_filePath).fileName();
}

void DocumentTab::onFileSystemChanged(const QString &path) {
    if (QFile::exists(path)) {
        loadFile(path);
        emit fileModified(path);
    }
}
