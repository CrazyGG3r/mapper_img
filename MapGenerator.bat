@echo off
title Map Generator
cd /d "%~dp0"
python app.py
if errorlevel 1 pause
