"""Tearsheet's engine: code makes every number, and the user's own AI tool writes the narrative."""

# The release version. pyproject.toml reads it from here.
ENGINE_VERSION = "0.0.1"

# Raised whenever code that makes numbers changes (design, Technical Plan §6).
# Raising PARSER_VERSION (item 23) raises it too.
METHOD_CODE_VERSION = 2

# Raised whenever an app-engine message changes (item 37).
PROTOCOL_VERSION = 1

__version__ = ENGINE_VERSION
