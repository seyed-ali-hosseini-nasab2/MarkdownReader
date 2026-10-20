#include "WindowsAssociation.h"

#ifdef Q_OS_WIN
#include <QCoreApplication>
#include <QDir>
#include <QSettings>
#include <windows.h>
#include <shlobj.h>

static QString getExecutablePath() {
    return QDir::toNativeSeparators(QCoreApplication::applicationFilePath());
}

bool WindowsAssociation::isRegistered() {
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes", QSettings::NativeFormat);
    QString handler = reg.value(".md/Default").toString();
    return handler == "MarkdownReader.Document";
}

bool WindowsAssociation::registerAssociation() {
    QString exePath = getExecutablePath();
    QString quotedExe = QString("\"%1\"").arg(exePath);
    QString openCommand = QString("%1 \"%2\"").arg(quotedExe, "%1");

    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes", QSettings::NativeFormat);

    // Associate extensions .md and .markdown
    reg.setValue(".md/Default", "MarkdownReader.Document");
    reg.setValue(".markdown/Default", "MarkdownReader.Document");

    // ProgID definition
    reg.setValue("MarkdownReader.Document/Default", "Markdown Document");
    reg.setValue("MarkdownReader.Document/DefaultIcon/Default", QString("%1,0").arg(exePath));
    reg.setValue("MarkdownReader.Document/shell/open/command/Default", openCommand);

    // Applications registry entry for "Open With" list
    reg.setValue("Applications/MarkdownReader.exe/shell/open/command/Default", openCommand);
    reg.setValue("Applications/MarkdownReader.exe/SupportedTypes/.md", "");
    reg.setValue("Applications/MarkdownReader.exe/SupportedTypes/.markdown", "");

    // User choice open with list
    QSettings userList("HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md", QSettings::NativeFormat);
    userList.setValue("OpenWithProgids/MarkdownReader.Document", "");

    reg.sync();
    userList.sync();

    // Notify Windows Explorer of the association change
    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    return true;
}

bool WindowsAssociation::unregisterAssociation() {
    QSettings reg("HKEY_CURRENT_USER\\Software\\Classes", QSettings::NativeFormat);
    reg.remove(".md");
    reg.remove(".markdown");
    reg.remove("MarkdownReader.Document");
    reg.remove("Applications/MarkdownReader.exe");
    reg.sync();

    SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
    return true;
}

#else

bool WindowsAssociation::isRegistered() { return false; }
bool WindowsAssociation::registerAssociation() { return false; }
bool WindowsAssociation::unregisterAssociation() { return false; }

#endif
