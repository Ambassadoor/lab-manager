from rest_framework.permissions import BasePermission

#Custom role based permissions
#TODO: Add permissions for the other roles
class IsManager(BasePermission):
    def has_permission(self, request, view):
        print(request.user.role)
        return request.user.is_authenticated and request.user.role == "Lab Manager"


class IsCoordinator(BasePermission):
    def has_permission(self, request, view):
        print(request.user.role)
        return request.user.is_authenticated and request.user.role == "Coordinator"
