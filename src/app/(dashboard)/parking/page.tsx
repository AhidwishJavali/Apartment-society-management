"use client";

import { useState } from "react";
import { ResourcePage } from "@/components/ResourcePage";
import { useOptions, useSession } from "@/components/session";
import { Badge, Button, ConfirmDialog, Modal, useToast } from "@/components/ui";
import { ResourceForm, type FieldDef } from "@/components/ResourceForm";
import { api, ClientError } from "@/lib/client";

type Slot = {
  id: number;
  slotNumber: string;
  vehicleType: "CAR" | "BIKE";
  status: "ALLOCATED" | "AVAILABLE";
  apartment: { block: string; flatNo: string } | null;
  vehicle: { id: number; vehicleNumber: string } | null;
};

const typeOptions = [{ value: "CAR", label: "Car" }, { value: "BIKE", label: "Bike" }];

export default function ParkingPage() {
  const user = useSession();
  const isAdmin = user.role === "ADMIN";
  const notify = useToast();
  const [refresh, setRefresh] = useState(0);
  const [allocating, setAllocating] = useState<Slot | null>(null);
  const [releasing, setReleasing] = useState<Slot | null>(null);
  // Only vehicles without a slot and of the right type can be allocated.
  const vehicles = useOptions(allocating ? `/api/vehicles?active=true` : null, (v) => ({
    value: v.id as number,
    label: `${v.vehicleNumber} (${v.vehicleType}) – ${(v.resident as { name: string }).name}`,
    meta: { parkingId: v.parkingId, type: v.vehicleType },
  }));

  const createFields: FieldDef[] = [
    { name: "slotNumber", label: "Slot number", required: true, placeholder: "e.g. A-P05" },
    { name: "vehicleType", label: "Slot type", type: "select", required: true, options: typeOptions },
  ];

  const eligible = vehicles.filter((o) => {
    return o.meta?.parkingId === null && o.meta?.type === allocating?.vehicleType;
  });

  async function release(slot: Slot) {
    try {
      await api(`/api/parking/${slot.id}`, { method: "PATCH", json: { action: "release" } });
      notify("Slot released");
      setRefresh((n) => n + 1);
    } catch (e) {
      notify(e instanceof ClientError ? e.message : "Request failed", "error");
    } finally {
      setReleasing(null);
    }
  }

  return (
    <>
      <ResourcePage<Slot>
        title="Parking"
        description={isAdmin ? "Slots, allocation and availability." : "Slots allocated to your flat."}
        endpoint="/api/parking"
        refreshKey={refresh}
        searchPlaceholder="Search slot number…"
        filters={[
          { name: "status", label: "Status", options: [{ value: "AVAILABLE", label: "Available" }, { value: "ALLOCATED", label: "Allocated" }] },
          { name: "vehicleType", label: "Type", options: typeOptions },
        ]}
        columns={[
          { header: "Slot", cell: (s) => s.slotNumber },
          { header: "Type", cell: (s) => s.vehicleType },
          { header: "Status", cell: (s) => <Badge value={s.status} /> },
          { header: "Flat", cell: (s) => (s.apartment ? `${s.apartment.block}-${s.apartment.flatNo}` : "—") },
          { header: "Vehicle", cell: (s) => s.vehicle?.vehicleNumber ?? "—" },
        ]}
        createFields={isAdmin ? createFields : undefined}
        createLabel="Add slot"
        editFields={isAdmin ? createFields : undefined}
        toFormValues={(s) => ({ slotNumber: s.slotNumber, vehicleType: s.vehicleType })}
        rowActions={isAdmin ? (s) =>
          s.status === "AVAILABLE" ? (
            <Button size="sm" variant="ghost" onClick={() => setAllocating(s)}>
              Allocate
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setReleasing(s)}>
              Release
            </Button>
          ) : undefined}
        removeLabel={isAdmin ? "Delete" : undefined}
        canRemove={(s) => s.status === "AVAILABLE"}
        removeMessage={(s) => `Delete slot ${s.slotNumber}?`}
      />
      {allocating && (
        <Modal title={`Allocate slot ${allocating.slotNumber}`} onClose={() => setAllocating(null)}>
          <ResourceForm
            fields={[{ name: "vehicleId", label: `${allocating.vehicleType === "CAR" ? "Car" : "Bike"} without a slot`, type: "select", required: true, options: eligible, help: eligible.length === 0 ? "No eligible vehicles. Register one on the Vehicles page first." : undefined }]}
            submitLabel="Allocate"
            onCancel={() => setAllocating(null)}
            onSubmit={async (v) => {
              await api(`/api/parking/${allocating.id}`, { method: "PATCH", json: { action: "allocate", vehicleId: Number(v.vehicleId) } });
              notify("Slot allocated");
              setAllocating(null);
              setRefresh((n) => n + 1);
            }}
          />
        </Modal>
      )}
      {releasing && (
        <ConfirmDialog
          title="Release slot?"
          message={`Slot ${releasing.slotNumber} will become available and ${releasing.vehicle?.vehicleNumber ?? "its vehicle"} will lose it.`}
          confirmLabel="Release"
          onConfirm={() => release(releasing)}
          onCancel={() => setReleasing(null)}
        />
      )}
    </>
  );
}
