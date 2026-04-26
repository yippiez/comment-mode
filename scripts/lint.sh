#!/bin/bash

# Run ast-grep linting
set -e
ast-grep scan --config sgconfig.yml
