import { describe, it, expect } from 'vitest';
import { verifiedBookingReceipt } from '../app/lib/booking-receipt';
const estimate='11111111-1111-4111-8111-111111111111',request='22222222-2222-4222-8222-222222222222';
const valid={ok:true,pending:true,leadId:`AI-${estimate}`,requestId:request,requestedTime:'October 20, 10:00 AM'};
describe('authoritative pending receipt',()=>{
  it('accepts the saved matching request',()=>expect(verifiedBookingReceipt(valid,estimate,request)).toEqual(valid));
  it.each([{requestedTime:''},{requestId:estimate},{leadId:`AI-${request}`},{pending:false},{ok:false}])('rejects incomplete or mismatched acknowledgement %j',override=>{
    expect(()=>verifiedBookingReceipt({...valid,...override},estimate,request)).toThrow();
  });
});
