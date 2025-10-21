@echo off
REM Set database credentials for the Node script
set DB_HOST=localhost
set DB_USER=root
set DB_PASSWORD=
set DB_NAME=savoryflavors

REM Run the sync script
"C:\Program Files\nodejs\node.exe" "%~dp0sync-mealdb-favorites.js"

REM Optional: log completion
echo %DATE% %TIME% MealDB sync finished >> "%~dp0mealdb-sync.log"