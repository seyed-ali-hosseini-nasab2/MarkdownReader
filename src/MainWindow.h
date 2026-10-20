#pragma once

#include <QMainWindow>
#include <QTabWidget>
#include <QString>
#include <QActionGroup>
#include "DocumentTab.h"

enum class ThemeMode {
    System,
    Dark,
    Light
};

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow() override = default;

    void openFile(const QString &filePath);
    void openFiles(const QStringList &filePaths);
    void bringToFront();

protected:
    bool eventFilter(QObject *watched, QEvent *event) override;
    void dragEnterEvent(QDragEnterEvent *event) override;
    void dropEvent(QDropEvent *event) override;

private slots:
    void openFileDialog();
    void closeTab(int index);
    void closeCurrentTab();
    void reloadCurrentTab();
    void onCurrentTabChanged(int index);
    void zoomIn();
    void zoomOut();
    void resetZoom();
    void setThemeMode(ThemeMode mode);
    void updateTheme();
    void registerFileAssociation();
    void showAbout();

private:
    void setupUI();
    void setupMenus();
    void applyApplicationStyle(const QString &theme);
    QString effectiveTheme() const;
    DocumentTab* currentDocumentTab() const;
    DocumentTab* createNewTab(const QString &filePath = QString());

    QTabWidget *m_tabWidget{nullptr};
    ThemeMode m_themeMode{ThemeMode::System};
    QActionGroup *m_themeActionGroup{nullptr};
    QAction *m_systemThemeAct{nullptr};
    QAction *m_darkThemeAct{nullptr};
    QAction *m_lightThemeAct{nullptr};
};
