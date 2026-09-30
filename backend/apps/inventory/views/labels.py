from rest_framework.permissions import IsAuthenticated
from rest_framework.viewsets import ModelViewSet

from apps.users.models import User
from apps.users.permissions import role_at_least

from ..filters import LabelTemplateFilter
from ..models import LabelTemplate
from ..serializers import LabelTemplateSerializer


class LabelTemplateView(ModelViewSet):
    queryset = LabelTemplate.objects.prefetch_related("fields").all()
    serializer_class = LabelTemplateSerializer
    filterset_class = LabelTemplateFilter

    permission_classes = [IsAuthenticated]

    # Reads stay open to any authenticated role — the print flow itself
    # (available to Stockroom+) looks a template up by kind before every
    # print. Writes need Lab Manager+, same as the user's own "admin/
    # manager users" ask for this feature: getting a template number or
    # object name wrong here means a real mislabeled print, not just a
    # cosmetic mistake.
    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [role_at_least(User.Role.LAB_MANAGER)()]
        return super().get_permissions()
