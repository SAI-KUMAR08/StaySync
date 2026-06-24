# Data model (multi-hostel)

Each hostel is isolated. Owner A only sees Hostel A; Owner B only sees Hostel B.

```
Owner
 └── Hostel (1 owner → 1 hostel in this app)
      ├── Floors
      │    └── Rooms
      │         └── Beds
      ├── Tenants (assigned to a bed → room → floor)
      ├── Payments (rent / fees per tenant per month)
      ├── Complaints (tickets)
      └── Notices (announcements)
```

Every record stores `ownerId` + `hostelId` so data never mixes between hostels.

## Payment status

| Status   | Meaning |
|----------|---------|
| `unpaid` | Current month rent not paid yet |
| `overdue` | Previous month(s) still not paid (or due date 30+ days ago) |
| `paid`    | Settled |

## Occupancy

- **Occupied beds** = beds with `status: occupied`
- **Available beds** = total beds − occupied

Display: `occupied / available` (e.g. `12 / 38`).
