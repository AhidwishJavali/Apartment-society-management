"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Badge, Button, useToast } from "@/components/ui";
import type { FieldDef } from "@/components/ResourceForm";
import { api, ClientError } from "@/lib/client";

type Vehicle = {
  id: number;
  residentId: number;
  vehicleNumber: string;
  vehicleType: "CAR" | "BIKE";
  brand: string | null;
  isActive: boolean;
  parkingId: number | null;
  resident: { id: number; name: string; apartment: { block: string; flatNo: string } };
  parking: { id: number; slotNumber: string } | null;
};

const typeOptions = [{ value: "CAR", label: "Car" }, { value: "BIKE", label: "Bike" }];

export default function VehiclesPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const residents = useOptions(isAdmin ? "/api/residents?active=true" : null, (r) => ({ value: r.id as number, label: String(r.name) }));
  const slots = useOptions(isAdmin ? "/api/parking?status=AVAILABLE" : null, (s) => ({ value: s.id as number, label: `${s.slotNumber} (${s.vehicleType})` }));

  const createFields: FieldDef[] = [
    { name: "residentId", label: "Resident", type: "select", required: true, options: residents },
    { name: "vehicleNumber", label: "Vehicle number", required: true, placeholder: "KA01AB1234" },
    { name: "vehicleType", label: "Type", type: "select", required: true, options: typeOptions },
    { name: "brand", label: "Brand" },
    { name: "parkingId", label: "Parking slot (optional)", type: "select", options: slots, help: "Only available slots of the same type are accepted" },
  ];
  const editFields = createFields.filter((f) => f.name !== "residentId" && f.name !== "parkingId");

  async function reactivate(v: Vehicle) {
    try {
      await api(`/api/vehicles/${v.id}`, { method: "PATCH", json: { isActive: true } });
      notify("Vehicle reactivated");
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    }
  }

  return (
    <ResourcePage<Vehicle>
      title="Vehicles"
      description={isAdmin ? "Registered vehicles and their parking slots." : "Vehicles registered to your flat."}
      endpoint="/api/vehicles"
      refreshKey={refresh}
      searchPlaceholder="Search number or brand…"
      filters={[{ name: "active", label: "Status", options: [{ value: "true", label: "Active" }, { value: "false", label: "Inactive" }] }]}
      columns={[
        { header: "Number", cell: (v) => v.vehicleNumber },
        { header: "Type", cell: (v) => v.vehicleType },
        { header: "Brand", cell: (v) => v.brand ?? "—" },
        { header: "Owner", cell: (v) => `${v.resident.name} (${v.resident.apartment.block}-${v.resident.apartment.flatNo})` },
        { header: "Slot", cell: (v) => v.parking?.slotNumber ?? "—" },
        { header: "Status", cell: (v) => <Badge value={v.isActive ? "AVAILABLE" : "INACTIVE"} /> },
      ]}
      createFields={isAdmin ? createFields : undefined}
      createLabel="Register vehicle"
      editFields={isAdmin ? editFields : undefined}
      toFormValues={(v) => ({ vehicleNumber: v.vehicleNumber, vehicleType: v.vehicleType, brand: v.brand ?? "" })}
      rowActions={isAdmin ? (v) => !v.isActive && (
        <Button size="sm" variant="ghost" onClick={() => reactivate(v)}>
          Reactivate
        </Button>
      ) : undefined}
      removeLabel={isAdmin ? "Deactivate" : undefined}
      canRemove={(v) => v.isActive}
      removeMessage={(v) => `Deactivate ${v.vehicleNumber}? Its parking slot (if any) will be released.`}
    />
  );
}
