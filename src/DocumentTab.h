#pragma once

#include <QWidget>
#include <QString>
#include <QFileSystemWatcher>
#include <QWebEngineView>
#include "DocumentBridge.h"

class DocumentTab : public QWidget {
    Q_OBJECT

public:
    explicit DocumentTab(QWidget *parent = nullptr);
    ~DocumentTab() override = default;

    bool loadFile(const QString &filePath);
    void reload();
    void setTheme(const QString &theme);
    void setZoomFactor(qreal factor);
    qreal zoomFactor() const;

    QString filePath() const { return m_filePath; }
    QString fileName() const;
    bool isEmpty() const { return m_filePath.isEmpty(); }

public slots:
    void onLinkActivated(const QString &href);

signals:
    void fileLoaded(const QString &filePath);
    void fileModified(const QString &filePath);
    void openFileRequested(const QString &filePath);

private slots:
    void onFileSystemChanged(const QString &path);

private:
    QWebEngineView *m_webView{nullptr};
    DocumentBridge *m_bridge{nullptr};
    QFileSystemWatcher m_fileWatcher;
    QString m_filePath;
    qreal m_zoomFactor{1.0};
};
