#pragma once

#include <QObject>
#include <QString>

class DocumentBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString markdownContent READ markdownContent NOTIFY markdownContentChanged)
    Q_PROPERTY(QString theme READ theme WRITE setTheme NOTIFY themeChanged)

public:
    explicit DocumentBridge(QObject *parent = nullptr) : QObject(parent), m_theme("dark") {}

    QString markdownContent() const {
        return m_markdownContent;
    }

    QString theme() const {
        return m_theme;
    }

public slots:
    void setMarkdown(const QString &content) {
        if (m_markdownContent != content) {
            m_markdownContent = content;
            emit markdownContentChanged(m_markdownContent);
        }
    }

    void setTheme(const QString &newTheme) {
        if (m_theme != newTheme) {
            m_theme = newTheme;
            emit themeChanged(m_theme);
        }
    }

    void openLink(const QString &url) {
        emit linkActivated(url);
    }

signals:
    void markdownContentChanged(const QString &newContent);
    void themeChanged(const QString &newTheme);
    void linkActivated(const QString &url);

private:
    QString m_markdownContent;
    QString m_theme;
};
