@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在更新索引...
python tools\build_index.py
echo.
echo 網站預覽：http://localhost:8000  （關閉這個視窗就會停止）
start "" http://localhost:8000
python -m http.server 8000
