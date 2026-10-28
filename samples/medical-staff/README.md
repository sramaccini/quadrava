# Sample project: Medical staff

A complete CRUD over the medical staff of a hospital, as a Quadrava project: list with filters, detail, creation, editing and deletion, in English and Italian.

To open it in Quadrava Studio, zip this folder (or use `../medical-staff.zip`) and choose **File → Import project (zip)…**, or open the folder with **Open project folder…**.

## Resources

| File | What it is |
| --- | --- |
| `project.json` | manifest: languages `en` (default) and `it`, theme `light`, and the setting `staffApi` (`/api/medical-staff`), the base address of the staff service |
| `datasources/medical-staff.json` | the calls of the staff service, shared by the screens; their base address is `{{ settings.staffApi }}`, so every url is only the rest of the path (`/{{params.id}}`) |
| `screens/medical-staff-list.json` | filters (name or number, staff type, department, status), paged table, CSV export; row actions Open, Edit, Delete (with confirmation) |
| `screens/medical-staff-detail.json` | the record of a staff member (`params.id`), with Edit and Delete |
| `screens/medical-staff-new.json` | entry form in two columns, with default values |
| `screens/medical-staff-edit.json` | the same form loaded from the service; the staff number cannot be changed |
| `navigation.json` | area «Staff registry» with the list and «New staff member» |
| `i18n/en.json`, `i18n/it.json` | the texts of the screens and the labels of the option values |

The form shows some fields only when they apply: the specialty for doctors, the professional register number for doctors, nurses, midwives and pharmacists, the contract end for fixed-term contracts (it must come after the hire date).

## The staff member

| Field | Type | Values |
| --- | --- | --- |
| `id` | number | assigned by the service |
| `registrationNumber` | text | staff number, unique (a duplicate gets 409) |
| `staffType` | text | `doctor`, `nurse`, `midwife`, `technician`, `therapist`, `pharmacist`, `assistant` |
| `firstName`, `lastName` | text | |
| `specialty` | text | doctors only |
| `licenseNumber` | text | doctors, nurses, midwives, pharmacists |
| `department` | text | `emergency`, `cardiology`, `surgery`, `pediatrics`, `radiology`, `internal-medicine`, `obstetrics`, `pharmacy` |
| `contract` | text | `permanent`, `fixed-term`, `consultant` |
| `hireDate`, `contractEnd` | date (YYYY-MM-DD) | `contractEnd` for fixed-term contracts |
| `shift` | text | `day`, `rotating`, `night`, `on-call` |
| `weeklyHours` | number | 1–48 |
| `email`, `phone` | text | |
| `active` | boolean | in service |
| `notes` | text | |

## The service the screens call

The project contains only the front end: the calls go to the BFF of the application, which forwards them to a staff service.

| Method and address | Data source | Answer |
| --- | --- | --- |
| `GET /api/medical-staff?page=&q=&staffType=&department=&active=` | `list` | one page: `{ "items": [...], "total": n, "size": n }` |
| `GET /api/medical-staff` | `export` | all the rows (for the CSV) |
| `GET /api/medical-staff/{id}` | `get` | the staff member |
| `POST /api/medical-staff` | `create` | the staff member created, with its `id`; 409 if the staff number exists |
| `PUT /api/medical-staff/{id}` | `update` | the staff member saved; 409 on a concurrent change |
| `DELETE /api/medical-staff/{id}` | `remove` | no content |

Permissions: `hospital.staff.read`, `hospital.staff.create`, `hospital.staff.update`, `hospital.staff.delete`. The screens hide the commands the user cannot use; the service must check the same permissions.

In the Studio preview there is no such service: reads return the sample data written in the editor (empty lists otherwise) and writes are simulated. Screens with `params.id` (detail, edit) need a parameter in the preview, for example `{"id": 1}`.
