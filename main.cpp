#include <QApplication>
#include <QFileInfo>
#include "src/MainWindow.h"

int main(int argc, char *argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("MarkdownReader");
    app.setOrganizationName("MarkdownEngine");

    MainWindow window;
    window.show();

    // Check if file path passed via command line arguments
    if (argc > 1) {
        QString filePath = QString::fromLocal8Bit(argv[1]);
        if (QFileInfo::exists(filePath)) {
            window.loadMarkdownFile(filePath);
        }
    }

    return QApplication::exec();
}

