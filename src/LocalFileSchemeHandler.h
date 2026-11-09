#pragma once

#include <QWebEngineUrlSchemeHandler>
#include <QWebEngineUrlRequestJob>
#include <QFile>
#include <QFileInfo>
#include <QMimeDatabase>
#include <QUrl>
#include <QDebug>

class LocalFileSchemeHandler : public QWebEngineUrlSchemeHandler {
    Q_OBJECT

public:
    explicit LocalFileSchemeHandler(QObject *parent = nullptr)
        : QWebEngineUrlSchemeHandler(parent) {}

    void requestStarted(QWebEngineUrlRequestJob *job) override {
        QUrl url = job->requestUrl();
        QString path = url.path();

#ifdef Q_OS_WIN
        // On Windows, QUrl::path() returns "/D:/...", strip the leading slash
        if (path.startsWith('/') && path.length() > 2 && path[2] == ':') {
            path = path.mid(1);
        }
#endif

        path = QUrl::fromPercentEncoding(path.toUtf8());

        QFileInfo info(path);
        if (!info.exists() || !info.isFile()) {
            qWarning() << "[LocalFileSchemeHandler] File not found:" << path;
            job->fail(QWebEngineUrlRequestJob::UrlNotFound);
            return;
        }

        auto *file = new QFile(path, job);
        if (!file->open(QIODevice::ReadOnly)) {
            qWarning() << "[LocalFileSchemeHandler] Failed to open file:" << path;
            job->fail(QWebEngineUrlRequestJob::RequestDenied);
            return;
        }

        QMimeDatabase db;
        QMimeType mime = db.mimeTypeForFile(info);
        QByteArray contentType = mime.name().toUtf8();
        if (contentType.isEmpty() || contentType == "application/octet-stream") {
            QString ext = info.suffix().toLower();
            if (ext == "jpg" || ext == "jpeg") contentType = "image/jpeg";
            else if (ext == "png") contentType = "image/png";
            else if (ext == "gif") contentType = "image/gif";
            else if (ext == "svg") contentType = "image/svg+xml";
            else if (ext == "webp") contentType = "image/webp";
            else if (ext == "bmp") contentType = "image/bmp";
            else if (ext == "ico") contentType = "image/x-icon";
        }

        job->reply(contentType, file);
    }
};
