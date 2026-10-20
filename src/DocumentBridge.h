#pragma once

#include <QObject>
#include <QString>

class DocumentBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString markdownContent READ markdownContent NOTIFY markdownContentChanged)

public:
    explicit DocumentBridge(QObject *parent = nullptr) : QObject(parent) {}

    QString markdownContent() const {
        return m_markdownContent;
    }

public slots:
    void setMarkdown(const QString &content) {
        if (m_markdownContent != content) {
            m_markdownContent = content;
            emit markdownContentChanged(m_markdownContent);
        }
    }

signals:
    void markdownContentChanged(const QString &newContent);

private:
    QString m_markdownContent;
};
