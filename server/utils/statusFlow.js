const STATUSES = {
  RECEIVED: 'Received',
  ACKNOWLEDGED: 'Acknowledged',
  CALLED_LEFT_MESSAGE: 'Called Customer - Left Message',
  SCHEDULED: 'Scheduled',
  DISPATCHED: 'Dispatched',
  OUTSIDE_VENDOR_DISPATCHED: 'Outside Vendor Dispatched',
  ON_SITE: 'On Site',
  DIAGNOSING: 'Diagnosing',
  IN_PROGRESS: 'In Progress',
  PARTS_NEEDED: 'Parts Needed',
  PARTS_ORDERED: 'Parts Ordered',
  PARTS_ARRIVED: 'Parts Arrived',
  ON_HOLD: 'Service is on hold',
  LEFT_SITE: 'Left Site - Will Schedule Return',
  UNIT_TO_BE_SWAPPED: 'Unit to be Swapped',
  UNIT_HAS_BEEN_SWAPPED: 'Unit Has Been Swapped',
  PENDING_APPROVAL: 'Pending Approval',
  PHONE_RESOLVED: 'Resolved via the Phone',
  COMPLETE: 'Complete',
  FOLLOW_UP_REQUIRED: 'Follow-Up Required',
  CANNOT_REPAIR: 'Cannot Repair',
  CANCELLED: 'Cancelled',
};

// Status changes that must NOT send customer or submitter notifications.
// The route writes the sheet + StatusHistory normally, then short-circuits
// before the notify dispatch. Office can still manually re-send via
// POST /api/notify/:srId if they later decide to inform the customer.
//
//   Called Customer - Left Message — internal trail only
//   Pending Approval               — has its own approval-request email path
//   Cancelled                      — handled out of band by phone
const SILENT_STATUSES = new Set([
  'Called Customer - Left Message',
  'Pending Approval',
  'Cancelled',
]);

const TECH_STATUSES = [
  'Dispatched',
  'On Site',
  'Diagnosing',
  'In Progress',
  'Parts Needed',
  'Left Site - Will Schedule Return',
  'Complete',
];

const ALL_STATUS_VALUES = Object.values(STATUSES);

function isValidStatus(status) {
  return ALL_STATUS_VALUES.includes(status);
}

function canTechSetStatus(status) {
  return TECH_STATUSES.includes(status);
}

function canRoleSetStatus(role, status) {
  if (role === 'Manager') return isValidStatus(status);
  if (role === 'Tech') return canTechSetStatus(status);
  return false;
}

module.exports = { STATUSES, TECH_STATUSES, ALL_STATUS_VALUES, SILENT_STATUSES, isValidStatus, canTechSetStatus, canRoleSetStatus };
