from rest_framework.permissions import BasePermission

from .models import User

# Admin and Lab Manager intentionally share a rank — they're the same
# permission tier today, kept as separate enum values for future org
# flexibility (e.g. IT eventually holding "Admin" while a non-technical
# person remains "Lab Manager"). Coordinator/Faculty share a rank too.
ROLE_RANK = {
    User.Role.ADMIN: 4,
    User.Role.LAB_MANAGER: 4,
    User.Role.COORDINATOR: 3,
    User.Role.FACULTY: 3,
    User.Role.STOCKROOM: 2,
    User.Role.LAB_ASSISTANT: 1,
}


def role_at_least(minimum_role):
    """Permission class factory: authenticated and ranked >= minimum_role.

    An unauthenticated request, or a role missing from ROLE_RANK entirely
    (shouldn't happen given the model's `choices`, but not assumed), is
    always denied rather than raising.
    """

    class HasMinimumRole(BasePermission):
        def has_permission(self, request, view):
            if not request.user.is_authenticated:
                return False
            return ROLE_RANK.get(request.user.role, 0) >= ROLE_RANK[minimum_role]

    return HasMinimumRole
