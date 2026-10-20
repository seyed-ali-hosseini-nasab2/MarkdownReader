#pragma once

#include <QString>

class WindowsAssociation {
public:
    static bool isRegistered();
    static bool registerAssociation();
    static bool unregisterAssociation();
};
