#include "DocumentTab.h"

#include <QVBoxLayout>
#include <QWebChannel>
#include <QFile>
#include <QFileInfo>
#include <QTextStream>
#include <QUrl>
#include <QDir>
#include <QDesktopServices>
#include <QMessageBox>
#include <QWebEnginePage>

class CustomWebEnginePage : public QWebEnginePage {
public:
    explicit CustomWebEnginePage(DocumentTab *tab, QObject *parent = nullptr)
        : QWebEnginePage(parent), m_tab(tab) {}

protected:
    bool acceptNavigationRequest(const QUrl &url, NavigationType type, bool isMainFrame) override {
        if (type == NavigationTypeLinkClicked) {
            if (url.scheme() == "qrc" && url.path() == "/web/viewer.html") {
                return true;
            }
            if (m_tab) {
                m_tab->onLinkActivated(url.toString());
            }
            return false;
        }
        return QWebEnginePage::acceptNavigationRequest(url, type, isMainFrame);
    }

private:
    DocumentTab *m_tab{nullptr};
};

DocumentTab::DocumentTab(QWidget *parent)
    : QWidget(parent),
      m_webView(new QWebEngineView(this)),
      m_bridge(new DocumentBridge(this)) {
    auto *layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);
    layout->addWidget(m_webView);

    auto *page = new CustomWebEnginePage(this, m_webView);
    m_webView->setPage(page);

    auto *channel = new QWebChannel(this);
    channel->registerObject(QStringLiteral("bridge"), m_bridge);
    page->setWebChannel(channel);

    m_webView->setUrl(QUrl("qrc:/web/viewer.html"));

    connect(m_bridge, &DocumentBridge::linkActivated, this, &DocumentTab::onLinkActivated);
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

void DocumentTab::onLinkActivated(const QString &href) {
    if (href.isEmpty()) return;

    // Check if it's an external web/network URL
    QUrl url(href);
    QString scheme = url.scheme().toLower();
    if (scheme == "http" || scheme == "https" || scheme == "mailto" || scheme == "ftp") {
        QDesktopServices::openUrl(url);
        return;
    }

    // Handle relative or local file link
    QString rawPath = href;
    if (rawPath.startsWith("qrc:/web/")) {
        rawPath = rawPath.mid(9);
    }

    int hashIdx = rawPath.indexOf('#');
    if (hashIdx >= 0) {
        rawPath = rawPath.left(hashIdx);
    }
    if (rawPath.isEmpty()) {
        return;
    }

    rawPath = QUrl::fromPercentEncoding(rawPath.toUtf8());

    QString targetPath;
    if (url.isLocalFile()) {
        targetPath = url.toLocalFile();
    } else {
        QDir baseDir;
        if (!m_filePath.isEmpty()) {
            baseDir = QFileInfo(m_filePath).dir();
        } else {
            baseDir = QDir::current();
        }
        targetPath = baseDir.absoluteFilePath(rawPath);
    }

    QFileInfo info(targetPath);
    if (!info.exists()) {
        QMessageBox::warning(this, tr("File Not Found"),
                             tr("The linked file could not be found:\n%1").arg(QDir::toNativeSeparators(targetPath)));
        return;
    }

    QString ext = info.suffix().toLower();
    if (ext == "md" || ext == "markdown" || ext == "mdown") {
        emit openFileRequested(info.canonicalFilePath());
    } else {
        QDesktopServices::openUrl(QUrl::fromLocalFile(info.canonicalFilePath()));
    }
}
