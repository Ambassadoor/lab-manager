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

# Adds models to admin site
admin.site.register(Chemical)
admin.site.register(Container)
admin.site.register(Location)
admin.site.register(ChemicalStorageCategories)
admin.site.register(SDS)
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
