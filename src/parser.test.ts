// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { parseBizTalkXml } from './parser';
import { sampleOrchestration } from './sample';

describe('parseBizTalkXml', () => {
  it('parses the sample orchestration and summarizes its shapes', () => {
    const result = parseBizTalkXml('vehicle.odx', sampleOrchestration);

    expect(result.title).toBe('SurfaceMaintVehicleData');
    expect(result.summary).toMatchObject({
      totalShapes: 10,
      receives: 2,
      sends: 3,
      transforms: 1,
      decisions: 2,
      scopes: 1,
    });
    expect(result.diagnostics).toEqual([]);
  });

  it('extracts attributes, child properties, and element references', () => {
    const source = `
      <Orchestration Name="References">
        <Send Name="Submit" Port="OrdersPort" Operation="CreateOrder">
          <Property Name="MessageType" Value="Contoso.Order" />
          <Correlation Name="OrderCorrelation" />
        </Send>
      </Orchestration>`;

    const result = parseBizTalkXml('references.odx', source);
    const send = result.shapes.find((shape) => shape.kind === 'send');

    expect(send).toBeDefined();
    expect(send?.attributes).toMatchObject({
      Name: 'Submit',
      Port: 'OrdersPort',
      Operation: 'CreateOrder',
    });
    expect(send?.references).toEqual(
      expect.arrayContaining([
        { kind: 'port', name: 'OrdersPort' },
        { kind: 'operation', name: 'CreateOrder' },
        { kind: 'message', name: 'Contoso.Order' },
        { kind: 'correlation', name: 'OrderCorrelation' },
      ]),
    );
  });

  it('tracks containment and sequence relationships', () => {
    const result = parseBizTalkXml(
      'flow.odx',
      '<Orchestration Name="Flow"><Scope Name="Work"><Receive Name="Input"/><Send Name="Output"/></Scope></Orchestration>',
    );
    const scope = result.shapes.find((shape) => shape.kind === 'scope');
    const receive = result.shapes.find((shape) => shape.kind === 'receive');
    const send = result.shapes.find((shape) => shape.kind === 'send');

    expect(receive?.parentId).toBe(scope?.id);
    expect(send?.parentId).toBe(scope?.id);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: scope?.id, to: receive?.id, kind: 'contains' }),
        expect.objectContaining({ from: scope?.id, to: send?.id, kind: 'contains' }),
        expect.objectContaining({ from: receive?.id, to: send?.id, kind: 'sequence' }),
      ]),
    );
  });

  it('uses namespace metadata and tolerates text before the XML markup', () => {
    const result = parseBizTalkXml(
      'schema.xsd',
      'export header\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:orders"/>',
    );

    expect(result.title).toBe('urn:orders');
    expect(result.namespace).toBe('urn:orders');
  });

  it('extracts the designer XML embedded in a BizTalk ODX source file', () => {
    const source = `#if __DESIGNER_DATA
#error Do not define __DESIGNER_DATA.
<?xml version="1.0" encoding="utf-8"?>
<om:MetaModel xmlns:om="http://schemas.microsoft.com/BizTalk/2003/DesignerData">
  <om:Element Type="Module"><om:Property Name="Name" Value="Orders" />
    <om:Element Type="Receive"><om:Property Name="Name" Value="Receive order" /></om:Element>
  </om:Element>
</om:MetaModel>
#endif // __DESIGNER_DATA
module Orders { }
`;

    const result = parseBizTalkXml('Orders.odx', source);

    expect(result.fileName).toBe('Orders.odx');
    expect(result.shapes.map(({ kind, name }) => ({ kind, name }))).toContainEqual({
      kind: 'receive',
      name: 'Receive order',
    });
  });

  it('reports empty models and rejects malformed XML', () => {
    const empty = parseBizTalkXml('empty.xml', '<root><documentation>Notes</documentation></root>');

    expect(empty.shapes).toEqual([]);
    expect(empty.diagnostics).toHaveLength(1);
    expect(() => parseBizTalkXml('broken.odx', '<Orchestration><Receive></Orchestration>')).toThrow(
      'The file could not be parsed as XML',
    );
  });
});
