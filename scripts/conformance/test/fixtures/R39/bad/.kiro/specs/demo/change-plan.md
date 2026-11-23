---
status: draft
---

## Strips in this spec

- profile.save
- profile.view

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| db.user.getByEmail | new | profile.save | | | |
| db.user.findById | new | profile.view | | | |
| db.user.loadById | new | profile.view | | | |
