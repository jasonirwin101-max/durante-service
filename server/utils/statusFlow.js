const STATUSES = {
  RECEIVED: 'Received',
  ACKNOWLEDGED: 'Acknowledged',
  SCHEDULED: 'Scheduled',
  DISPATCHED: 'Dispatched',
  ON_SITE: 'On Site',
  DIAGNOSING: 'Diagnosing',
  IN_PROGRESS: 'In Progress',
  PARTS_NEEDED: 'Parts Needed',
  PARTS_ORDERED: 'Parts Ordered',
  PARTS_ARRIVED: 'Parts Arrived',
  LEFT_SITE: 'Left Site - Will Schedule Return',
  UNIT_TO_BE_SWAPPED: 'Unit to be Swapped',
  UNIT_HAS_BEEN_SWAPPED: 'Unit Has Been Swapped',
  COMPLETE: 'Complete',
  FOLLOW_UP_REQUIRED: 'Follow-Up Required',
  CANNOT_REPAIR: 'Cannot Repair',
  CANCELLED: 'Cancelled',
};

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

module.exports = { STATUSES, TECH_STATUSES, ALL_STATUS_VALUES, isValidStatus, canTechSetStatus, canRoleSetStatus };
