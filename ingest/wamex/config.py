"""Endpoints and constants. Per DATA.md: keep every base URL in one place --
the department has renamed twice (DMIRS -> DEMIRS -> DMPE) and will again."""

SLIP_BASE = (
    "https://services.slip.wa.gov.au/public/rest/services"
    "/SLIP_Public_Services/Industry_and_Mining/MapServer"
)

# Mirror documented on data.wa.gov.au, used as failover.
SLIP_MIRROR = (
    "https://public-services.slip.wa.gov.au/public/rest/services"
    "/SLIP_Public_Services/Industry_and_Mining/MapServer"
)

LAYER_DRILLHOLES = 28   # Mineral Exploration Drillholes (open file), DMIRS-046
LAYER_REPORTS = 22      # Mineral exploration reports (WAMEX), DMIRS-033

# CC BY 4.0 licence condition. Must be visible in UI and on every export.
# Keep as ONE constant -- see DATA.md "naming churn warning".
ATTRIBUTION = "Based on Department of Mines, Petroleum and Exploration material"
LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/"

# Be a good citizen: this is a free public service run by a government
# department. Identify ourselves, rate limit, and prefer bulk downloads at scale.
USER_AGENT = (
    "wamex-explorer/0.1 (open-file exploration data research; "
    "contact.roshan.kr.sharma@gmail.com)"
)
REQUEST_DELAY_S = 0.5   # between paginated requests
MAX_RECORD_COUNT = 10000  # server cap, per DATA.md

# Phase 0 study area: 1 deg x 1 deg around Kalgoorlie (-30.75, 121.47).
KALGOORLIE_BBOX = (121.0, -31.25, 122.0, -30.25)  # xmin, ymin, xmax, ymax
