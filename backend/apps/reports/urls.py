from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .views import RegistryView, QueryView

router = DefaultRouter()

router.register(r"fields", RegistryView, basename="fields")
router.register(r"query", QueryView, basename="query")

urlpatterns = [path("", include(router.urls))]
