#pragma once

#include <QMainWindow>
#include <QWebEngineView>
#include <QFileSystemWatcher>
#include <QString>
#include "DocumentBridge.h"

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow() override = default;

    void loadMarkdownFile(const QString &filePath);

protected:
    void dragEnterEvent(QDragEnterEvent *event) override;
    void dropEvent(QDropEvent *event) override;

private slots:
    void openFileDialog();
    void reloadCurrentFile();
    void onFileModified(const QString &path);
    void zoomIn();
    void zoomOut();
    void resetZoom();
    void showAbout();

private:
    void setupUI();
    void setupWebEngine();

    QWebEngineView *m_webView{nullptr};
    DocumentBridge *m_bridge{nullptr};
    QFileSystemWatcher m_fileWatcher;
    QString m_currentFilePath;
    qreal m_currentZoomFactor{1.0};
};
