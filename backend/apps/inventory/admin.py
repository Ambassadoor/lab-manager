from django.contrib import admin
from .models import (
    Chemical,
    Container,
    Location,
    ChemicalStorageCategories,
    SDS,
    LabelTemplate,
    LabelTemplateField,
    LocationTypes,
    WeightReading,
    CheckoutEvent,
    Ingredient,
)


# created_at/updated_at are set automatically (TimeStampedModel), so they're
# shown read-only rather than left off the page.
class TimestampedAdmin(admin.ModelAdmin):
    readonly_fields = ["created_at", "updated_at"]


# Adds models to admin site
admin.site.register(Chemical, TimestampedAdmin)
admin.site.register(Container, TimestampedAdmin)
admin.site.register(Location, TimestampedAdmin)
admin.site.register(ChemicalStorageCategories)
admin.site.register(SDS, TimestampedAdmin)
admin.site.register(LocationTypes)
admin.site.register(WeightReading)
admin.site.register(CheckoutEvent)
admin.site.register(Ingredient)


class LabelTemplateFieldInline(admin.TabularInline):
    model = LabelTemplateField
    extra = 1


# Custom (not the bare admin.site.register(Model) above) so the barcode/text
# object names can be edited inline on the same page — the frontend's own
# management UI (App.tsx's /label-templates) is the primary way to manage
# these; this is a fallback.
@admin.register(LabelTemplate)
class LabelTemplateAdmin(admin.ModelAdmin):
    list_display = ["name", "kind", "template_number", "media_width_mm"]
    list_filter = ["kind"]
    inlines = [LabelTemplateFieldInline]
