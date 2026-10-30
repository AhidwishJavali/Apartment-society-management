export const vehicleInclude = {
  resident: { select: { id: true, name: true, apartment: { select: { block: true, flatNo: true } } } },
  parking: { select: { id: true, slotNumber: true } },
} as const;

export const complaintInclude = {
  resident: { select: { id: true, name: true, apartmentId: true, apartment: { select: { block: true, flatNo: true } } } },
  staff: { select: { id: true, name: true, role: true } },
} as const;
