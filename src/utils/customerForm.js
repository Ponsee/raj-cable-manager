// Form state helpers for the customer add / edit form.
export const emptyCustomerForm = {
  name: "",
  phone: "",
  alt_phone: "",
  email: "",
  address: "",
  notes: "",
};

export const customerToForm = (c) => ({
  name: c.name || "",
  phone: c.phone || "",
  alt_phone: c.alt_phone || "",
  email: c.email || "",
  address: c.address || "",
  notes: c.notes || "",
});
