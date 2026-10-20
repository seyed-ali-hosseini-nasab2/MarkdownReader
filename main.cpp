#include <QApplication>
#include <QFileInfo>
#include <QIcon>
#include "src/MainWindow.h"
#include "src/SingleInstance.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("MarkdownReader");
    app.setApplicationDisplayName("Markdown & Mermaid Reader");
    app.setOrganizationName("MarkdownEngine");
    app.setWindowIcon(QIcon(":/resources/app_icon.png"));

    // Extract file arguments
    QStringList filesToOpen;
    for (int i = 1; i < argc; ++i) {
        QString path = QString::fromLocal8Bit(argv[i]);
        if (QFileInfo::exists(path)) {
            filesToOpen << QFileInfo(path).absoluteFilePath();
        }
    }

    // Check for an already running primary instance
    SingleInstanceManager singleInstance("MarkdownReader_SingleInstance_IPC_hp");
    if (singleInstance.hasPreviousInstance()) {
        // Hand off files to the primary instance and exit immediately
        singleInstance.sendMessage(filesToOpen);
        return 0;
    }

    MainWindow window;
    window.show();

    // Listen for incoming files sent from secondary instances
    QObject::connect(&singleInstance, &SingleInstanceManager::filesReceived, &window, [&window](const QStringList &files) {
        if (!files.isEmpty()) {
            window.openFiles(files);
        }
        window.bringToFront();
    });

    if (!filesToOpen.isEmpty()) {
        window.openFiles(filesToOpen);
    }

    return QApplication::exec();
}
