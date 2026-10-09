import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import api from '../services/api';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { value: 'insurance', label: 'Insurance' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'puc', label: 'PUC' },
  { value: 'tax', label: 'Tax' },
  { value: 'permit', label: 'Permit' },
  { value: 'license', label: 'License' },
];

const BROKER_SERVICES = [
  { id: 'transfer', label: 'Transfer' },
  { id: 'hpt', label: 'HPT' },
  { id: 'hpa', label: 'HPA' },
  { id: 'insurance', label: 'Insurance' },
  { id: 'permit', label: 'Permit' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'tax', label: 'Tax' },
  { id: 'odit', label: 'Odit' },
  { id: 'other', label: 'Other' },
];

export default function CustomerForm({ customer, onSuccess, onClose }) {
  const isEdit = !!customer;
  const [customerType, setCustomerType] = useState(customer?.is_broker || customer?.category === 'broker' ? 'broker' : 'standard');
  const [selectedBrokerServices, setSelectedBrokerServices] = useState(customer?.categories || ['transfer']);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: customer
      ? {
        is_broker: customer.is_broker || false,
        broker_name: customer.broker_name || '',
        name: customer.name || '',
        contact_number: customer.contact_number || '',
        category: customer.category || 'insurance',
        vehicle_number: customer.vehicle_number || '',
        date_of_work: customer.date_of_work || '',
        rto_name: customer.rto_name || '',
        rto_agent_name: customer.rto_agent_name || '',
        application_number: customer.application_number || '',
        city: customer.city || '',
        case_type: customer.case_type || 'mobile_otp',
        start_date: customer.start_date || '',
        end_date: customer.end_date || '',
        amount_total: customer.amount_total || 0,
        amount_paid: customer.amount_paid || 0,
        notes: customer.notes || '',
      }
      : { category: 'insurance', case_type: 'mobile_otp', amount_total: 0, amount_paid: 0 },
  });

  const category = watch('category');
  const caseType = watch('case_type');

  const toggleBrokerService = (serviceId) => {
    setSelectedBrokerServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((s) => s !== serviceId)
        : [...prev, serviceId]
    );
  };

  const onSubmit = async (data) => {
    const { amount_paid, ...customerPayload } = data;

    let payload;
    if (customerType === 'broker') {
      const bServices = selectedBrokerServices.length ? selectedBrokerServices : ['transfer'];
      payload = {
        is_broker: true,
        broker_name: data.broker_name,
        name: data.name,
        contact_number: data.contact_number,
        vehicle_number: data.vehicle_number,
        date_of_work: data.date_of_work || null,
        rto_name: data.rto_name || '',
        rto_agent_name: data.rto_agent_name || '',
        application_number: data.application_number || '',
        city: data.city || '',
        case_type: data.case_type || 'mobile_otp',
        category: 'broker',
        categories: bServices,
        service_details: {
          broker: {
            broker_name: data.broker_name,
            rto_name: data.rto_name,
            rto_agent_name: data.rto_agent_name,
            application_number: data.application_number,
            city: data.city,
            case_type: data.case_type || 'mobile_otp',
            date_of_work: data.date_of_work,
            services: bServices,
          },
        },
        notes: data.notes || '',
        amount_total: data.amount_total,
        start_date: data.date_of_work || null,
      };
    } else {
      payload = {
        ...customerPayload,
        is_broker: false,
      };
    }

    try {
      if (isEdit) {
        await api.put(`/customers/${customer.id}`, payload);
        const newPaid = Number(amount_paid || 0);
        if (newPaid !== Number(customer.amount_paid || 0)) {
          await api.put(`/receipts/${customer.id}/amount`, { amount_paid: newPaid });
        }
        toast.success('Record updated successfully!');
      } else {
        const res = await api.post('/customers', payload);
        const newCustomerId = res.data?.data?.id;
        const initialPaid = parseFloat(amount_paid);
        if (newCustomerId && initialPaid > 0) {
          await api.post('/payments', { customer_id: newCustomerId, amount: initialPaid });
        }
        toast.success('Record created successfully!');
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong.';
      toast.error(msg);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ maxWidth: '680px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? (customerType === 'broker' ? 'Edit Broker Record' : 'Edit Customer') : 'Add New Customer / Broker'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Selection Option Header */}
        <div className="customer-type-selector" style={{ marginBottom: 16 }}>
          <div>
            <div className="customer-type-title">Selection Option</div>
            <div className="customer-type-subtitle">Customer entry type</div>
          </div>
          <div className="type-toggle-group">
            <button
              type="button"
              className={`type-toggle-btn ${customerType === 'standard' ? 'active' : ''}`}
              onClick={() => setCustomerType('standard')}
            >
              Standard Customer
            </button>
            <button
              type="button"
              className={`type-toggle-btn ${customerType === 'broker' ? 'active' : ''}`}
              onClick={() => setCustomerType('broker')}
            >
              Broker
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)}>
          {customerType === 'broker' ? (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Broker Name *</label>
                  <input
                    className={`form-control ${errors.broker_name ? 'error' : ''}`}
                    placeholder="Broker Name"
                    {...register('broker_name', { required: 'Broker name required' })}
                  />
                  {errors.broker_name && <p className="form-error">{errors.broker_name.message}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Name *</label>
                  <input
                    className={`form-control ${errors.name ? 'error' : ''}`}
                    placeholder="Customer Name"
                    {...register('name', { required: 'Customer name required' })}
                  />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Customer Contact Number *</label>
                  <input
                    className={`form-control ${errors.contact_number ? 'error' : ''}`}
                    placeholder="+91 98765 43210"
                    {...register('contact_number', { required: 'Contact number required' })}
                  />
                  {errors.contact_number && <p className="form-error">{errors.contact_number.message}</p>}
                </div>
                <div className="form-group">
                  <label className="form-label">Customer Gadi Number *</label>
                  <input
                    className={`form-control ${errors.vehicle_number ? 'error' : ''}`}
                    placeholder="GJ-01-AB-1234"
                    {...register('vehicle_number', { required: 'Gadi number required' })}
                  />
                  {errors.vehicle_number && <p className="form-error">{errors.vehicle_number.message}</p>}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Date of Work</label>
                  <input type="date" className="form-control" {...register('date_of_work')} />
                </div>
                <div className="form-group">
                  <label className="form-label">RTO Name</label>
                  <input className="form-control" placeholder="RTO Name" {...register('rto_name')} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">RTO Agent Name</label>
                  <input className="form-control" placeholder="Agent Name" {...register('rto_agent_name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Application Number</label>
                  <input className="form-control" placeholder="Application No." {...register('application_number')} />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-control" placeholder="City" {...register('city')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Case Verification</label>
                  <div className="case-radio-group">
                    <label className={`case-radio-label ${caseType === 'mobile_otp' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        value="mobile_otp"
                        {...register('case_type')}
                        checked={caseType === 'mobile_otp'}
                        onChange={() => setValue('case_type', 'mobile_otp')}
                      />
                      Mobile OTP
                    </label>
                    <label className={`case-radio-label ${caseType === 'aadhar_otp' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        value="aadhar_otp"
                        {...register('case_type')}
                        checked={caseType === 'aadhar_otp'}
                        onChange={() => setValue('case_type', 'aadhar_otp')}
                      />
                      Adhar OTP
                    </label>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Services</label>
                <div className="broker-services-grid">
                  {BROKER_SERVICES.map((srv) => (
                    <label
                      key={srv.id}
                      className={`broker-service-chip ${selectedBrokerServices.includes(srv.id) ? 'checked' : ''}`}
                      onClick={() => toggleBrokerService(srv.id)}
                    >
                      <span>{selectedBrokerServices.includes(srv.id) ? '✓' : '+'}</span>
                      {srv.label}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Remark</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional remarks..."
                  {...register('notes')}
                />
              </div>
            </>
          ) : (
            <>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    className={`form-control ${errors.name ? 'error' : ''}`}
                    placeholder="Customer full name"
                    {...register('name', { required: 'Name is required' })}
                  />
                  {errors.name && <p className="form-error">{errors.name.message}</p>}
                </div>

                <div className="form-group">
                  <label className="form-label">Contact Number *</label>
                  <input
                    className={`form-control ${errors.contact_number ? 'error' : ''}`}
                    placeholder="+91 98765 43210"
                    {...register('contact_number', { required: 'Contact number is required' })}
                  />
                  {errors.contact_number && <p className="form-error">{errors.contact_number.message}</p>}
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-control" {...register('category', { required: true })}>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {(category === 'insurance' || category === 'permit') && (
                  <div className="form-group">
                    <label className="form-label">Vehicle Number</label>
                    <input
                      className="form-control"
                      placeholder="GJ-01-AB-1234"
                      {...register('vehicle_number')}
                    />
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-control" {...register('start_date')} />
                </div>
                <div className="form-group">
                  <label className="form-label">End / Expiry Date</label>
                  <input type="date" className="form-control" {...register('end_date')} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Optional notes..."
                  {...register('notes')}
                />
              </div>
            </>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Total Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className={`form-control ${errors.amount_total ? 'error' : ''}`}
                placeholder="0.00"
                {...register('amount_total', { required: 'Amount required', min: { value: 0, message: 'Must be ≥ 0' } })}
              />
              {errors.amount_total && <p className="form-error">{errors.amount_total.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label">
                Amount Paid (₹){isEdit ? ' — edits reconcile payment records' : ' (initial payment)'}
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-control"
                placeholder="0.00"
                {...register('amount_paid')}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? <span className="spinner" /> : (isEdit ? 'Save Changes' : 'Create Record')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
