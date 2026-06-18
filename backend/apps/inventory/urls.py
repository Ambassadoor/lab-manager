from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContainerView

router = DefaultRouter()

router.register(r'containers', ContainerView, basename="container")

urlpatterns = [
    path("", include(router.urls)),
]