#include <QApplication>
#include <QFileInfo>
#include <QIcon>
#include "src/MainWindow.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("MarkdownReader");
    app.setApplicationDisplayName("Markdown & Mermaid Reader");
    app.setOrganizationName("MarkdownEngine");
    app.setWindowIcon(QIcon(":/resources/app_icon.png"));

    MainWindow window;
    window.show();

    // Check if file paths passed via command line arguments
    QStringList filesToOpen;
    for (int i = 1; i < argc; ++i) {
        QString path = QString::fromLocal8Bit(argv[i]);
        if (QFileInfo::exists(path)) {
            filesToOpen << path;
        }
    }
    if (!filesToOpen.isEmpty()) {
        window.openFiles(filesToOpen);
    }

    return QApplication::exec();
}
