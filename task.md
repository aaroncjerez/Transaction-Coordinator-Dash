# Task: Debug Deal Type & Stage Sync

- [ ] Investigation <!-- id: 0 -->
    - [ ] Review `DealDetail.tsx` `syncToAirtable` mapping <!-- id: 1 -->
    - [ ] Review `lib/sync.ts` `updateAirtableRecord` logic <!-- id: 2 -->
    - [ ] Browser Test: specifically check console for "Synced [Field] to Airtable" <!-- id: 3 -->
- [ ] Fix <!-- id: 4 -->
    - [ ] Correct any field name mismatches (e.g. "Deal type" vs "Deal Type") <!-- id: 5 -->
    - [ ] Improve error visibility if sync fails <!-- id: 6 -->
- [ ] Verification <!-- id: 7 -->
    - [ ] Confirm success log in browser console <!-- id: 8 -->
