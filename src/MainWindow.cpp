#include "MainWindow.h"
#include "WindowsAssociation.h"

#ifdef Q_OS_WIN
#include <windows.h>
#endif

#include <QGuiApplication>
#include <QStyleHints>
#include <QFileDialog>
#include <QFileInfo>
#include <QMenuBar>
#include <QToolBar>
#include <QStatusBar>
#include <QDragEnterEvent>
#include <QDropEvent>
#include <QMimeData>
#include <QMessageBox>
#include <QSettings>
#include <QIcon>
#include <QTabBar>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent),
      m_tabWidget(new QTabWidget(this)) {
    setupUI();
    setupMenus();

    // Listen to OS system theme changes dynamically
    connect(QGuiApplication::styleHints(), &QStyleHints::colorSchemeChanged, this, [this](Qt::ColorScheme) {
        if (m_themeMode == ThemeMode::System) {
            updateTheme();
        }
    });

    // Load saved theme preference
    QSettings settings("MarkdownEngine", "MarkdownReader");
    int savedTheme = settings.value("themeMode", static_cast<int>(ThemeMode::System)).toInt();
    if (savedTheme == static_cast<int>(ThemeMode::Dark)) {
        m_darkThemeAct->setChecked(true);
        setThemeMode(ThemeMode::Dark);
    } else if (savedTheme == static_cast<int>(ThemeMode::Light)) {
        m_lightThemeAct->setChecked(true);
        setThemeMode(ThemeMode::Light);
    } else {
        m_systemThemeAct->setChecked(true);
        setThemeMode(ThemeMode::System);
    }

    setWindowIcon(QIcon(":/resources/app_icon.png"));
    setAcceptDrops(true);
    resize(1320, 880);
}

void MainWindow::setupUI() {
    m_tabWidget->setTabsClosable(true);
    m_tabWidget->setMovable(true);
    m_tabWidget->setDocumentMode(true);
    setCentralWidget(m_tabWidget);

    connect(m_tabWidget, &QTabWidget::tabCloseRequested, this, &MainWindow::closeTab);
    connect(m_tabWidget, &QTabWidget::currentChanged, this, &MainWindow::onCurrentTabChanged);

    // Install application-wide event filter so drag & drop works over all child widgets and WebEngine
    qApp->installEventFilter(this);

    // Initial empty welcome tab
    createNewTab();
    statusBar()->showMessage("Ready. Open .md files or drag and drop into the window.");
}

void MainWindow::setupMenus() {
    // File Menu
    auto *fileMenu = menuBar()->addMenu("&File");
    auto *openAct = fileMenu->addAction("&Open File(s)...", QKeySequence::Open, this, &MainWindow::openFileDialog);
    auto *closeTabAct = fileMenu->addAction("&Close Tab", QKeySequence(Qt::CTRL | Qt::Key_W), this, &MainWindow::closeCurrentTab);
    auto *reloadAct = fileMenu->addAction("&Reload Document", QKeySequence::Refresh, this, &MainWindow::reloadCurrentTab);
    fileMenu->addSeparator();
    fileMenu->addAction("E&xit", QKeySequence::Quit, this, &QWidget::close);

    // View Menu
    auto *viewMenu = menuBar()->addMenu("&View");
    auto *themeMenu = viewMenu->addMenu("&Theme");

    m_themeActionGroup = new QActionGroup(this);
    m_systemThemeAct = themeMenu->addAction("System Default", [this]() { setThemeMode(ThemeMode::System); });
    m_darkThemeAct = themeMenu->addAction("Dark Theme", [this]() { setThemeMode(ThemeMode::Dark); });
    m_lightThemeAct = themeMenu->addAction("Light Theme", [this]() { setThemeMode(ThemeMode::Light); });

    m_systemThemeAct->setCheckable(true);
    m_darkThemeAct->setCheckable(true);
    m_lightThemeAct->setCheckable(true);
    m_themeActionGroup->addAction(m_systemThemeAct);
    m_themeActionGroup->addAction(m_darkThemeAct);
    m_themeActionGroup->addAction(m_lightThemeAct);

    viewMenu->addSeparator();
    viewMenu->addAction("Zoom &In", QKeySequence::ZoomIn, this, &MainWindow::zoomIn);
    viewMenu->addAction("Zoom &Out", QKeySequence::ZoomOut, this, &MainWindow::zoomOut);
    viewMenu->addAction("&Reset Zoom", QKeySequence(Qt::CTRL | Qt::Key_0), this, &MainWindow::resetZoom);

    // Tools Menu
    auto *toolsMenu = menuBar()->addMenu("&Tools");
    toolsMenu->addAction("Set as Default Markdown (.md) Viewer...", this, &MainWindow::registerFileAssociation);

    // Help Menu
    auto *helpMenu = menuBar()->addMenu("&Help");
    helpMenu->addAction("&About Markdown Reader", this, &MainWindow::showAbout);

    // Toolbar
    auto *toolbar = addToolBar("Controls");
    toolbar->setMovable(false);
    toolbar->addAction(openAct);
    toolbar->addAction(reloadAct);
    toolbar->addAction(closeTabAct);
}

DocumentTab* MainWindow::currentDocumentTab() const {
    return qobject_cast<DocumentTab*>(m_tabWidget->currentWidget());
}

DocumentTab* MainWindow::createNewTab(const QString &filePath) {
    auto *tab = new DocumentTab(this);
    tab->setTheme(effectiveTheme());

    connect(tab, &DocumentTab::openFileRequested, this, [this](const QString &path) {
        openFile(path);
    });

    connect(tab, &DocumentTab::fileLoaded, this, [this, tab](const QString &path) {
        int idx = m_tabWidget->indexOf(tab);
        if (idx != -1) {
            QFileInfo info(path);
            m_tabWidget->setTabText(idx, info.fileName());
            m_tabWidget->setTabToolTip(idx, path);
            if (m_tabWidget->currentIndex() == idx) {
                setWindowTitle(info.fileName() + " - Markdown & Mermaid Reader");
            }
        }
    });

    connect(tab, &DocumentTab::fileModified, this, [this](const QString &path) {
        statusBar()->showMessage("Live updated: " + QFileInfo(path).fileName(), 2000);
    });

    int index = m_tabWidget->addTab(tab, filePath.isEmpty() ? "Welcome" : QFileInfo(filePath).fileName());
    if (!filePath.isEmpty()) {
        m_tabWidget->setTabToolTip(index, filePath);
        tab->loadFile(filePath);
    }
    m_tabWidget->setCurrentIndex(index);
    return tab;
}

void MainWindow::openFile(const QString &filePath) {
    if (filePath.isEmpty()) return;

    // Check if file is already open in an existing tab
    for (int i = 0; i < m_tabWidget->count(); ++i) {
        auto *tab = qobject_cast<DocumentTab*>(m_tabWidget->widget(i));
        if (tab && tab->filePath() == filePath) {
            m_tabWidget->setCurrentIndex(i);
            return;
        }
    }

    // If only one empty tab is open, reuse it
    if (m_tabWidget->count() == 1) {
        auto *firstTab = qobject_cast<DocumentTab*>(m_tabWidget->widget(0));
        if (firstTab && firstTab->isEmpty()) {
            firstTab->loadFile(filePath);
            m_tabWidget->setTabText(0, QFileInfo(filePath).fileName());
            m_tabWidget->setTabToolTip(0, filePath);
            setWindowTitle(QFileInfo(filePath).fileName() + " - Markdown & Mermaid Reader");
            return;
        }
    }

    createNewTab(filePath);
}

void MainWindow::openFiles(const QStringList &filePaths) {
    for (const auto &path : filePaths) {
        openFile(path);
    }
}

void MainWindow::openFileDialog() {
    QStringList paths = QFileDialog::getOpenFileNames(
        this,
        "Open Markdown File(s)",
        QString(),
        "Markdown Files (*.md *.markdown *.mdown);;All Files (*.*)"
    );

    if (!paths.isEmpty()) {
        openFiles(paths);
    }
}

void MainWindow::closeTab(int index) {
    if (index < 0 || index >= m_tabWidget->count()) return;

    QWidget *widget = m_tabWidget->widget(index);
    m_tabWidget->removeTab(index);
    delete widget;

    if (m_tabWidget->count() == 0) {
        createNewTab();
        setWindowTitle("Markdown & Mermaid Reader");
    }
}

void MainWindow::closeCurrentTab() {
    closeTab(m_tabWidget->currentIndex());
}

void MainWindow::reloadCurrentTab() {
    auto *tab = currentDocumentTab();
    if (tab) {
        tab->reload();
        statusBar()->showMessage("Reloaded document.", 2000);
    }
}

void MainWindow::onCurrentTabChanged(int index) {
    if (index >= 0 && index < m_tabWidget->count()) {
        auto *tab = qobject_cast<DocumentTab*>(m_tabWidget->widget(index));
        if (tab && !tab->isEmpty()) {
            setWindowTitle(tab->fileName() + " - Markdown & Mermaid Reader");
            statusBar()->showMessage("Viewing: " + tab->filePath());
            return;
        }
    }
    setWindowTitle("Markdown & Mermaid Reader");
}

void MainWindow::zoomIn() {
    auto *tab = currentDocumentTab();
    if (tab) {
        qreal z = qMin(tab->zoomFactor() + 0.1, 3.0);
        tab->setZoomFactor(z);
        statusBar()->showMessage(QString("Page Zoom: %1%").arg(static_cast<int>(z * 100)), 1500);
    }
}

void MainWindow::zoomOut() {
    auto *tab = currentDocumentTab();
    if (tab) {
        qreal z = qMax(tab->zoomFactor() - 0.1, 0.4);
        tab->setZoomFactor(z);
        statusBar()->showMessage(QString("Page Zoom: %1%").arg(static_cast<int>(z * 100)), 1500);
    }
}

void MainWindow::resetZoom() {
    auto *tab = currentDocumentTab();
    if (tab) {
        tab->setZoomFactor(1.0);
        statusBar()->showMessage("Page Zoom: 100%", 1500);
    }
}

QString MainWindow::effectiveTheme() const {
    if (m_themeMode == ThemeMode::Dark) return "dark";
    if (m_themeMode == ThemeMode::Light) return "light";

    // System mode: read from OS
    auto scheme = QGuiApplication::styleHints()->colorScheme();
    return (scheme == Qt::ColorScheme::Light) ? "light" : "dark";
}

void MainWindow::setThemeMode(ThemeMode mode) {
    m_themeMode = mode;
    QSettings settings("MarkdownEngine", "MarkdownReader");
    settings.setValue("themeMode", static_cast<int>(mode));
    updateTheme();
}

void MainWindow::updateTheme() {
    QString theme = effectiveTheme();
    applyApplicationStyle(theme);

    // Propagate theme to all open tabs
    for (int i = 0; i < m_tabWidget->count(); ++i) {
        auto *tab = qobject_cast<DocumentTab*>(m_tabWidget->widget(i));
        if (tab) {
            tab->setTheme(theme);
        }
    }
}

void MainWindow::applyApplicationStyle(const QString &theme) {
    if (theme == "light") {
        setStyleSheet(R"(
            QMainWindow {
                background-color: #f6f8fa;
                color: #1f2328;
            }
            QMenuBar {
                background-color: #ffffff;
                color: #1f2328;
                border-bottom: 1px solid #d0d7de;
                padding: 2px;
            }
            QMenuBar::item:selected {
                background-color: #eaeef2;
                border-radius: 4px;
            }
            QMenu {
                background-color: #ffffff;
                color: #1f2328;
                border: 1px solid #d0d7de;
            }
            QMenu::item:selected {
                background-color: #0969da;
                color: #ffffff;
            }
            QToolBar {
                background-color: #ffffff;
                border-bottom: 1px solid #d0d7de;
                spacing: 6px;
                padding: 4px;
            }
            QToolButton {
                background-color: transparent;
                color: #1f2328;
                border-radius: 4px;
                padding: 5px 10px;
                font-weight: 500;
            }
            QToolButton:hover {
                background-color: #eaeef2;
            }
            QTabWidget::pane {
                border-top: 1px solid #d0d7de;
                background-color: #ffffff;
            }
            QTabBar::tab {
                background-color: #eaeef2;
                color: #57606a;
                border: 1px solid #d0d7de;
                border-bottom: none;
                border-top-left-radius: 6px;
                border-top-right-left: 6px;
                padding: 8px 16px;
                margin-right: 2px;
                font-size: 13px;
            }
            QTabBar::tab:selected {
                background-color: #ffffff;
                color: #0969da;
                font-weight: bold;
                border-top: 2px solid #0969da;
            }
            QTabBar::tab:hover:!selected {
                background-color: #f3f4f6;
            }
            QStatusBar {
                background-color: #ffffff;
                color: #57606a;
                border-top: 1px solid #d0d7de;
            }
        )");
    } else {
        // Dark theme
        setStyleSheet(R"(
            QMainWindow {
                background-color: #0d1117;
                color: #c9d1d9;
            }
            QMenuBar {
                background-color: #161b22;
                color: #c9d1d9;
                border-bottom: 1px solid #30363d;
                padding: 2px;
            }
            QMenuBar::item:selected {
                background-color: #21262d;
                border-radius: 4px;
            }
            QMenu {
                background-color: #161b22;
                color: #c9d1d9;
                border: 1px solid #30363d;
            }
            QMenu::item:selected {
                background-color: #1f6feb;
                color: #ffffff;
            }
            QToolBar {
                background-color: #161b22;
                border-bottom: 1px solid #30363d;
                spacing: 6px;
                padding: 4px;
            }
            QToolButton {
                background-color: transparent;
                color: #c9d1d9;
                border-radius: 4px;
                padding: 5px 10px;
                font-weight: 500;
            }
            QToolButton:hover {
                background-color: #21262d;
            }
            QTabWidget::pane {
                border-top: 1px solid #30363d;
                background-color: #0d1117;
            }
            QTabBar::tab {
                background-color: #161b22;
                color: #8b949e;
                border: 1px solid #30363d;
                border-bottom: none;
                border-top-left-radius: 6px;
                border-top-right-left: 6px;
                padding: 8px 16px;
                margin-right: 2px;
                font-size: 13px;
            }
            QTabBar::tab:selected {
                background-color: #0d1117;
                color: #58a6ff;
                font-weight: bold;
                border-top: 2px solid #58a6ff;
            }
            QTabBar::tab:hover:!selected {
                background-color: #21262d;
            }
            QStatusBar {
                background-color: #161b22;
                color: #8b949e;
                border-top: 1px solid #30363d;
            }
        )");
    }
}

void MainWindow::registerFileAssociation() {
    bool ok = WindowsAssociation::registerAssociation();
    if (ok) {
        QMessageBox::information(
            this,
            "File Association Registered",
            "<h3>Markdown Reader Registered Successfully!</h3>"
            "<p>Markdown Reader has been registered in Windows for <b>.md</b> and <b>.markdown</b> files.</p>"
            "<p>It is now available in the Windows <i>'Open with'</i> menu and can be chosen as the default application.</p>"
        );
        statusBar()->showMessage("Registered as Windows .md file handler.", 3000);
    } else {
        QMessageBox::warning(this, "Association Error", "Failed to register file association in Windows registry.");
    }
}

void MainWindow::showAbout() {
    QMessageBox::about(
        this,
        "About Markdown Reader",
        "<h3>Markdown & Mermaid Reader</h3>"
        "<p>Professional desktop Markdown viewer with tabbed navigation, system dark/light theme support, and interactive vector Mermaid diagram zoom & pan.</p>"
        "<p>Built with C++, Qt 6.8 WebEngine, marked, and mermaid.js.</p>"
    );
}

bool MainWindow::eventFilter(QObject *watched, QEvent *event) {
    if (event->type() == QEvent::DragEnter) {
        auto *de = static_cast<QDragEnterEvent*>(event);
        if (de->mimeData()->hasUrls()) {
            de->acceptProposedAction();
            return true;
        }
    } else if (event->type() == QEvent::DragMove) {
        auto *dm = static_cast<QDragMoveEvent*>(event);
        if (dm->mimeData()->hasUrls()) {
            dm->acceptProposedAction();
            return true;
        }
    } else if (event->type() == QEvent::Drop) {
        auto *de = static_cast<QDropEvent*>(event);
        const auto urls = de->mimeData()->urls();
        QStringList filePaths;
        for (const auto &url : urls) {
            if (url.isLocalFile()) {
                filePaths << url.toLocalFile();
            }
        }
        if (!filePaths.isEmpty()) {
            openFiles(filePaths);
            de->acceptProposedAction();
            return true;
        }
    }
    return QMainWindow::eventFilter(watched, event);
}

void MainWindow::bringToFront() {
    if (isMinimized()) {
        if (isMaximized()) {
            showMaximized();
        } else {
            showNormal();
        }
    } else {
        show();
    }
    raise();
    activateWindow();
#ifdef Q_OS_WIN
    HWND hwnd = reinterpret_cast<HWND>(winId());
    if (IsIconic(hwnd)) {
        ShowWindow(hwnd, SW_RESTORE);
    } else {
        ShowWindow(hwnd, SW_SHOW);
    }
    SetForegroundWindow(hwnd);
#endif
}

void MainWindow::dragEnterEvent(QDragEnterEvent *event) {
    if (event->mimeData()->hasUrls()) {
        event->acceptProposedAction();
    }
}

void MainWindow::dropEvent(QDropEvent *event) {
    const auto urls = event->mimeData()->urls();
    QStringList filePaths;
    for (const auto &url : urls) {
        if (url.isLocalFile()) {
            filePaths << url.toLocalFile();
        }
    }
    if (!filePaths.isEmpty()) {
        openFiles(filePaths);
    }
}

