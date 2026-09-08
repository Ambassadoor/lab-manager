from rest_framework import mixins
from rest_framework.permissions import AllowAny
from rest_framework.viewsets import GenericViewSet

from apps.users.models import User
from apps.users.permissions import role_at_least

from ..filters import SDSFilter
from ..models import SDS
from ..serializers import SDSSerializer, SDSWriteSerializer


# List/retrieve are fully public (no login, no CSRF) — SDS documents are
# public safety information, matching the "fully public SDS viewing"
# decision from the roles roadmap. Only create needs a role; there's no
# update/destroy — old revisions are retained, corrections happen by
# uploading a new one (same append-only treatment as CheckoutEvent/
# WeightReading).
class SDSView(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, GenericViewSet
):
    queryset = SDS.objects.select_related("container", "container__chemical")
    filterset_class = SDSFilter
    permission_classes = [AllowAny]
    # No authentication_classes override here (unlike RegisterView, which
    # this was first modeled on) — that view only ever has one, genuinely
    # public action. This one also has `create`, which needs to see who's
    # actually logged in; class-level authentication_classes = [] would
    # leave request.user as AnonymousUser for every action, including
    # create, so role_at_least would reject every request regardless of
    # the real user's role. AllowAny on list/retrieve already makes those
    # work with or without a session, so the default authenticators are
    # safe to leave in place here.

    def get_permissions(self):
        if self.action == "create":
            return [role_at_least(User.Role.STOCKROOM)()]
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "create":
            return SDSWriteSerializer
        return SDSSerializer
