#!/bin/sh
#Check frontend formatting
echo "Running format checks"
RESULT=0
echo "Running prettier checks"
(cd frontend && pnpm format:check) || RESULT=1
echo "Running lint checks"
(cd frontend && pnpm lint) || RESULT=1
echo "Running ruff checks"
(cd backend && poetry run ruff format --check ) || RESULT=1
(cd backend && poetry run ruff check .) || RESULT=1

if [ $RESULT -gt 0 ]; then
    echo "Formatting needed before you can push"
    echo "Exiting with code 1"
     exit 1 
fi