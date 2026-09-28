from rest_framework.routers import DefaultRouter

from .views import BugReportView, FeedbackView

router = DefaultRouter()
router.register(r"reports", BugReportView, basename="bug-report")
router.register(r"general", FeedbackView, basename="feedback")

urlpatterns = router.urls
