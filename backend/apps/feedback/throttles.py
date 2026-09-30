from rest_framework.throttling import AnonRateThrottle, UserRateThrottle

# Only applied to the create actions — anonymous submissions are allowed from
# the public pages, so these (not auth) are what keep the endpoints from
# being flooded. Rates live in REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].


class ReportAnonThrottle(AnonRateThrottle):
    scope = "reports_anon"


class ReportUserThrottle(UserRateThrottle):
    scope = "reports_user"
