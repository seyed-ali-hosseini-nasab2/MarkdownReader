cmake_minimum_required(VERSION 3.25)
project(MarkdownReader VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Default to local Qt installation on Windows if CMAKE_PREFIX_PATH not provided
if(WIN32 AND NOT DEFINED CMAKE_PREFIX_PATH AND EXISTS "D:/Qt/6.8.0/msvc2022_64")
    set(CMAKE_PREFIX_PATH "D:/Qt/6.8.0/msvc2022_64")
endif()

find_package(Qt6 COMPONENTS
        Core
        Gui
        Widgets
        WebEngineWidgets
        WebChannel
        Network
        REQUIRED)

set(PLATFORM_SOURCES "")
if (WIN32)
    list(APPEND PLATFORM_SOURCES resources/app.rc)
endif()

add_executable(MarkdownReader
        main.cpp
        src/MainWindow.h
        src/MainWindow.cpp
        src/DocumentTab.h
        src/DocumentTab.cpp
        src/DocumentBridge.h
        src/WindowsAssociation.h
        src/WindowsAssociation.cpp
        src/SingleInstance.h
        src/SingleInstance.cpp
        resources.qrc
        ${PLATFORM_SOURCES}
)

target_link_libraries(MarkdownReader PRIVATE
        Qt6::Core
        Qt6::Gui
        Qt6::Widgets
        Qt6::WebEngineWidgets
        Qt6::WebChannel
        Qt6::Network
)

if (WIN32)
    target_link_libraries(MarkdownReader PRIVATE shell32)
endif()

# Automated deployment step to make .exe completely offline and standalone
if (WIN32)
    get_target_property(QT_QMAKE_EXECUTABLE Qt6::qmake IMPORTED_LOCATION)
    get_filename_component(QT_BIN_DIR "${QT_QMAKE_EXECUTABLE}" DIRECTORY)
    find_program(WINDEPLOYQT_EXE windeployqt HINTS "${QT_BIN_DIR}")

    if (WINDEPLOYQT_EXE)
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND "${WINDEPLOYQT_EXE}"
                    --no-translations
                    --compiler-runtime
                    "$<TARGET_FILE:${PROJECT_NAME}>"
            COMMENT "Running windeployqt to deploy runtime dependencies for offline execution..."
        )
    endif()
endif()

