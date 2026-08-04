export const sampleOrchestration = `<?xml version="1.0" encoding="utf-8"?>
<Orchestration Name="SurfaceMaintVehicleData">
  <Receive Name="Receive vehicle update" Port="HttpVehicleUpdate" Message="VehicleInfoFromSource" Activate="true" />
  <Scope Name="Normalize input">
    <ConstructMessage Name="Build canonical vehicle message" MessageConstructed="CanonicalVehicle">
      <Transform Name="Map source vehicle data" MapName="TTC.SurfaceMaint.VehicleInfo_To_CanonicalVehicle" SourceMessage="VehicleInfoFromSource" TargetMessage="CanonicalVehicle" />
    </ConstructMessage>
  </Scope>
  <Decide Name="Is maintenance request present?">
    <Rule Name="MaintenanceRequired" Expression="CanonicalVehicle.MaintReqCreated == true" />
    <Send Name="Send maintenance request" Port="MaximoPort" Message="CanonicalVehicle" Operation="CreateWorkOrder" />
    <Send Name="Publish vehicle location" Port="CADAVLPort" Message="CanonicalVehicle" Operation="UpsertVehicleLocation" />
  </Decide>
  <Receive Name="Receive backend response" Port="MaximoPort" Message="MaintenanceResponse" />
  <Send Name="Return orchestration response" Port="HttpVehicleUpdate" Message="VehicleInfoFromSourceResponse" />
</Orchestration>`;
