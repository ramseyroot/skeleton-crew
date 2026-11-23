---
status: draft
---

## Strips in this spec

- profile.save
- profile.view

## Steps

| Step | Action | Used by (this spec) | Affected strips | Reason | Distinct from |
|---|---|---|---|---|---|
| db.user.getByEmail | new | profile.save | | | Includes deleted users, unlike db.user.findByEmail |
| db.user.findById | new | profile.view | | | |
