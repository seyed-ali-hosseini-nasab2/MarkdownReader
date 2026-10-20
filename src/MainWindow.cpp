#include "MainWindow.h"

#include <QWebEnginePage>
#include <QWebChannel>
#include <QFileDialog>
#include <QFile>
#include <QFileInfo>
#include <QTextStream>
#include <QMenuBar>
#include <QToolBar>
#include <QStatusBar>
#include <QDragEnterEvent>
#include <QDropEvent>
#include <QMimeData>
#include <QMessageBox>
#include <QUrl>
#include <QKeySequence>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent),
      m_webView(new QWebEngineView(this)),
      m_bridge(new DocumentBridge(this)) {
    setupUI();
    setupWebEngine();

    setAcceptDrops(true);
    resize(1280, 860);
    setWindowTitle("Markdown & Mermaid Reader");
}

void MainWindow::setupUI() {
    setCentralWidget(m_webView);

    // Menu Bar
    auto *fileMenu = menuBar()->addMenu("&File");
    auto *openAct = fileMenu->addAction("&Open File...", this, &MainWindow::openFileDialog, QKeySequence::Open);
    auto *reloadAct = fileMenu->addAction("&Reload", this, &MainWindow::reloadCurrentFile, QKeySequence::Refresh);
    fileMenu->addSeparator();
    fileMenu->addAction("E&xit", this, &QWidget::close, QKeySequence::Quit);

    auto *viewMenu = menuBar()->addMenu("&View");
    viewMenu->addAction("Zoom &In", this, &MainWindow::zoomIn, QKeySequence::ZoomIn);
    viewMenu->addAction("Zoom &Out", this, &MainWindow::zoomOut, QKeySequence::ZoomOut);
    viewMenu->addAction("&Reset Zoom", this, &MainWindow::resetZoom, QKeySequence(Qt::CTRL | Qt::Key_0));

    auto *helpMenu = menuBar()->addMenu("&Help");
    helpMenu->addAction("&About Markdown Reader", this, &MainWindow::showAbout);

    // Toolbar
    auto *toolbar = addToolBar("Navigation");
    toolbar->setMovable(false);
    toolbar->addAction(openAct);
    toolbar->addAction(reloadAct);

    statusBar()->showMessage("Ready. Open a .md file or drag & drop one into the window.");
}

void MainWindow::setupWebEngine() {
    auto *channel = new QWebChannel(this);
    channel->registerObject(QStringLiteral("bridge"), m_bridge);
    m_webView->page()->setWebChannel(channel);

    // Load bundled offline html viewer from Qt resource
    m_webView->setUrl(QUrl("qrc:/web/viewer.html"));
}

void MainWindow::openFileDialog() {
    QString path = QFileDialog::getOpenFileName(
        this,
        "Open Markdown File",
        QString(),
        "Markdown Files (*.md *.markdown *.mdown);;All Files (*.*)"
    );

    if (!path.isEmpty()) {
        loadMarkdownFile(path);
    }
}

void MainWindow::loadMarkdownFile(const QString &filePath) {
    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QMessageBox::critical(this, "Error Opening File", "Failed to open file:\n" + file.errorString());
        return;
    }

    QTextStream stream(&file);
    stream.setEncoding(QStringConverter::Utf8);
    QString content = stream.readAll();
    file.close();

    // Hot-reload watching
    if (!m_currentFilePath.isEmpty()) {
        m_fileWatcher.removePath(m_currentFilePath);
    }
    m_currentFilePath = filePath;
    m_fileWatcher.addPath(filePath);
    connect(&m_fileWatcher, &QFileSystemWatcher::fileChanged, this, &MainWindow::onFileModified, Qt::UniqueConnection);

    // Send content to JavaScript viewer
    m_bridge->setMarkdown(content);

    QFileInfo info(filePath);
    setWindowTitle(info.fileName() + " - Markdown & Mermaid Reader");
    statusBar()->showMessage("Loaded: " + filePath);
}

void MainWindow::reloadCurrentFile() {
    if (!m_currentFilePath.isEmpty() && QFile::exists(m_currentFilePath)) {
        loadMarkdownFile(m_currentFilePath);
        statusBar()->showMessage("Reloaded: " + m_currentFilePath, 2500);
    }
}

void MainWindow::onFileModified(const QString &path) {
    if (QFile::exists(path)) {
        loadMarkdownFile(path);
        statusBar()->showMessage("Live update: file modified externally.", 2500);
    }
}

void MainWindow::zoomIn() {
    m_currentZoomFactor = qMin(m_currentZoomFactor + 0.1, 3.0);
    m_webView->setZoomFactor(m_currentZoomFactor);
    statusBar()->showMessage(QString("Page Zoom: %1%").arg(static_cast<int>(m_currentZoomFactor * 100)), 1500);
}

void MainWindow::zoomOut() {
    m_currentZoomFactor = qMax(m_currentZoomFactor - 0.1, 0.4);
    m_webView->setZoomFactor(m_currentZoomFactor);
    statusBar()->showMessage(QString("Page Zoom: %1%").arg(static_cast<int>(m_currentZoomFactor * 100)), 1500);
}

void MainWindow::resetZoom() {
    m_currentZoomFactor = 1.0;
    m_webView->setZoomFactor(1.0);
    statusBar()->showMessage("Page Zoom: 100%", 1500);
}

void MainWindow::showAbout() {
    QMessageBox::about(
        this,
        "About Markdown Reader",
        "<h3>Markdown & Mermaid Reader</h3>"
        "<p>High-performance offline Markdown viewer with interactive Mermaid vector diagram zoom & pan support.</p>"
        "<p>Built with C++, Qt 6.8 WebEngine, marked, and mermaid.js.</p>"
    );
}

void MainWindow::dragEnterEvent(QDragEnterEvent *event) {
    if (event->mimeData()->hasUrls()) {
        const auto urls = event->mimeData()->urls();
        if (!urls.isEmpty() && urls.first().isLocalFile()) {
            event->acceptProposedAction();
        }
    }
}

void MainWindow::dropEvent(QDropEvent *event) {
    const auto urls = event->mimeData()->urls();
    if (!urls.isEmpty() && urls.first().isLocalFile()) {
        loadMarkdownFile(urls.first().toLocalFile());
    }
}
