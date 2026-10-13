"""Canvas service boundaries.

The canvas keeps one process for now, but each AI capability owns its API
surface in a separate module. The main application wires the existing
business handlers into these routers without changing canvas persistence.
"""

