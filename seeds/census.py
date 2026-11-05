"""Census rows for today: one encounter per lifecycle status, optionally PCC-linked.

Run with `wtenv seed census [--status S ...] [--date YYYY-MM-DD] [--pcc] [--user EMAIL]`.
It moves existing encounters to the date, so the default Census filter shows them.
It prefers encounters whose note has a file, then ones in the user's facilities, and
gives the user access to the facility when the pick is outside them.
`--pcc` gives each picked patient and facility placeholder PCC ids and turns on
`can_send_to_pcc`, so the note's PCC section renders (fake the PCC API in the browser).
Prints one JSON object: the rows it changed, with their old values, and a deep link
that opens each note.
"""

import argparse
import datetime
import json
import os

from django.apps import apps
from django.db import transaction
from django.utils import timezone

Encounter = apps.get_model("encounters", "Encounter")
Note = apps.get_model("notes", "Note")
UserFacility = apps.get_model("users", "UserFacility")
PccFacility = apps.get_model("pcc", "PccFacility")
User = apps.get_model("users", "User")

parser = argparse.ArgumentParser(prog="wtenv seed census")
parser.add_argument("--status", action="append", choices=Encounter.LifecycleStatus.values,
                    help="lifecycle status to seed (repeatable; default: all)")
parser.add_argument("--date", type=datetime.date.fromisoformat, default=timezone.localdate())
parser.add_argument("--pcc", action="store_true", help="link the picked patients and facilities to placeholder PCC ids")
parser.add_argument("--user", default=os.environ.get("WTENV_LOGIN_EMAIL", ""))
args = parser.parse_args(json.loads(os.environ.get("WTENV_SEED_ARGS", "[]")))

user = User.objects.filter(email=args.user).first() if args.user else None
facility_ids = list(
    UserFacility.objects.filter(user=user).exclude(status="deleted").values_list("facility_id", flat=True)
) if user else []

encounters = Encounter.objects.exclude(status="deleted").select_related("patient", "facility")
with_file = set(Note.objects.exclude(file="").exclude(file__isnull=True).values_list("encounter_id", flat=True))

result = {"date": args.date.isoformat(), "user": args.user or None, "rows": [], "missing": []}


def rank(encounter):
    return (encounter.id not in with_file, encounter.facility_id not in facility_ids)


with transaction.atomic():
    for status in args.status or Encounter.LifecycleStatus.values:
        candidates = encounters.filter(lifecycle_status=status)
        encounter = min(
            [*candidates.filter(id__in=with_file), *candidates.filter(facility_id__in=facility_ids)[:1], *candidates[:1]],
            key=rank, default=None,
        )
        if not encounter:
            result["missing"].append(status)
            continue
        row = {
            "status": status,
            "encounter_id": str(encounter.id),
            "patient": f"{encounter.patient.first_name} {encounter.patient.last_name}",
            "facility": encounter.facility.name,
            "old_date": encounter.date.isoformat(),
            "note_has_file": encounter.id in with_file,
            "url": f"/census?autoOpenNoteModal=true&encounterId={encounter.id}",
        }
        Encounter.objects.filter(pk=encounter.pk).update(date=args.date)
        if user and encounter.facility_id not in facility_ids:
            UserFacility.objects.create(user=user, facility=encounter.facility)
            facility_ids.append(encounter.facility_id)
            row["granted_facility_access"] = True
        if args.pcc:
            patient, facility = encounter.patient, encounter.facility
            row["old_patient_pcc_id"] = patient.pcc_id
            row["old_can_send_to_pcc"] = facility.can_send_to_pcc
            patient.pcc_id = patient.pcc_id or f"WTENV-PAT-{str(patient.id)[-8:]}"
            patient.save(update_fields=["pcc_id"])
            facility.can_send_to_pcc = True
            facility.save(update_fields=["can_send_to_pcc"])
            pcc_facility, _ = PccFacility.objects.get_or_create(
                facility=facility,
                defaults={"pcc_id": f"WTENV-FAC-{str(facility.id)[-8:]}", "facility_name": facility.name, "pcc_raw_data": {}},
            )
            row["patient_pcc_id"] = patient.pcc_id
            row["facility_pcc_id"] = pcc_facility.pcc_id
        result["rows"].append(row)

print(json.dumps(result, indent=2))
