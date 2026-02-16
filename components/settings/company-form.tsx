'use client'

import { useState, useEffect, useRef } from 'react'
import { Tables } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { CountryCombobox } from '@/components/settings/country-combobox'
import { updateCompanyField, updateCompany, deleteCompany } from '@/app/(app)/settings/actions'
import { toast } from 'sonner'
import { Loader2, AlertCircle, Check } from 'lucide-react'

type Company = Tables<'companies'>

interface CompanyFormProps {
  company: Company
  userRole: string
}

export function CompanyForm({ company, userRole }: CompanyFormProps) {
  const [formData, setFormData] = useState({
    name: company.name || '',
    company_registration_id: company.company_registration_id || '',
    tax_id: company.tax_id || '',
    address_line1: company.address_line1 || '',
    address_line2: company.address_line2 || '',
    city: company.city || '',
    postal_code: company.postal_code || '',
    country: company.country || '',
    bank_account_name: company.bank_account_name || '',
    bank_account_number: company.bank_account_number || '',
    bank_bic: company.bank_bic || '',
  })
  
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  
  const initialDataRef = useRef(formData)
  const isOwner = userRole === 'owner'
  
  // Check if form is dirty
  useEffect(() => {
    const hasChanges = Object.keys(formData).some(
      (key) => formData[key as keyof typeof formData] !== initialDataRef.current[key as keyof typeof formData]
    )
    setIsDirty(hasChanges)
  }, [formData])
  
  // Handle field change
  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }
  
  // Auto-save on blur
  const handleFieldBlur = async (field: string, value: string) => {
    if (!isOwner) return
    
    // Only save if value changed
    if (value === initialDataRef.current[field as keyof typeof formData]) {
      return
    }
    
    const formDataToSend = new FormData()
    formDataToSend.append('field', field)
    formDataToSend.append('value', value)
    
    const result = await updateCompanyField(formDataToSend)
    
    if (result.success) {
      // Update initial data
      initialDataRef.current = { ...initialDataRef.current, [field]: value }
      
      toast.success('Changes saved')
    } else {
      toast.error(result.error || 'Failed to save changes')
    }
  }
  
  // Save all changes
  const handleSaveAll = async () => {
    if (!isOwner || !isDirty) return
    
    setIsSaving(true)
    
    const formDataToSend = new FormData()
    Object.entries(formData).forEach(([key, value]) => {
      formDataToSend.append(key, value)
    })
    
    const result = await updateCompany(formDataToSend)
    
    setIsSaving(false)
    
    if (result.success) {
      initialDataRef.current = { ...formData }
      setIsDirty(false)
      
      toast.success('All changes saved')
    } else {
      toast.error(result.error || 'Failed to save changes')
    }
  }
  
  // Delete company
  const handleDeleteCompany = async () => {
    if (!isOwner) return
    
    setIsDeleting(true)
    
    const formDataToSend = new FormData()
    formDataToSend.append('companyName', deleteConfirmName)
    
    const result = await deleteCompany(formDataToSend)
    
    if (!result.success) {
      setIsDeleting(false)
      toast.error(result.error || 'Failed to delete company')
    }
    // If successful, redirect happens in server action
  }
  
  return (
    <div className="space-y-6">
      {!isOwner && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Only owners can edit company settings
          </AlertDescription>
        </Alert>
      )}
      
      <Card>
        <CardHeader>
          <CardTitle>Company information</CardTitle>
          <CardDescription>
            Basic details about your company
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              onBlur={(e) => handleFieldBlur('name', e.target.value)}
              disabled={!isOwner}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="company_registration_id">Company registration ID</Label>
            <Input
              id="company_registration_id"
              value={formData.company_registration_id}
              onChange={(e) => handleFieldChange('company_registration_id', e.target.value)}
              onBlur={(e) => handleFieldBlur('company_registration_id', e.target.value)}
              disabled={!isOwner}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tax_id">Tax ID *</Label>
            <Input
              id="tax_id"
              value={formData.tax_id}
              onChange={(e) => handleFieldChange('tax_id', e.target.value)}
              onBlur={(e) => handleFieldBlur('tax_id', e.target.value)}
              disabled={!isOwner}
              required
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Invoice address</CardTitle>
          <CardDescription>
            Address used for invoicing and billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address_line1">Address line 1 *</Label>
            <Input
              id="address_line1"
              value={formData.address_line1}
              onChange={(e) => handleFieldChange('address_line1', e.target.value)}
              onBlur={(e) => handleFieldBlur('address_line1', e.target.value)}
              disabled={!isOwner}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="address_line2">Address line 2</Label>
            <Input
              id="address_line2"
              value={formData.address_line2}
              onChange={(e) => handleFieldChange('address_line2', e.target.value)}
              onBlur={(e) => handleFieldBlur('address_line2', e.target.value)}
              disabled={!isOwner}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleFieldChange('city', e.target.value)}
                onBlur={(e) => handleFieldBlur('city', e.target.value)}
                disabled={!isOwner}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal code *</Label>
              <Input
                id="postal_code"
                value={formData.postal_code}
                onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                onBlur={(e) => handleFieldBlur('postal_code', e.target.value)}
                disabled={!isOwner}
                required
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="country">Country *</Label>
            <CountryCombobox
              value={formData.country}
              onValueChange={(value) => {
                handleFieldChange('country', value)
                handleFieldBlur('country', value)
              }}
              disabled={!isOwner}
            />
          </div>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle>Bank information</CardTitle>
          <CardDescription>
            Bank account details for payments
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bank_account_name">Account name *</Label>
            <Input
              id="bank_account_name"
              value={formData.bank_account_name}
              onChange={(e) => handleFieldChange('bank_account_name', e.target.value)}
              onBlur={(e) => handleFieldBlur('bank_account_name', e.target.value)}
              disabled={!isOwner}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bank_account_number">Account number *</Label>
            <Input
              id="bank_account_number"
              value={formData.bank_account_number}
              onChange={(e) => handleFieldChange('bank_account_number', e.target.value)}
              onBlur={(e) => handleFieldBlur('bank_account_number', e.target.value)}
              disabled={!isOwner}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="bank_bic">BIC / SWIFT code</Label>
            <Input
              id="bank_bic"
              value={formData.bank_bic}
              onChange={(e) => handleFieldChange('bank_bic', e.target.value)}
              onBlur={(e) => handleFieldBlur('bank_bic', e.target.value)}
              disabled={!isOwner}
            />
          </div>
        </CardContent>
      </Card>
      
      {isOwner && (
        <div className="flex justify-end">
          <Button
            onClick={handleSaveAll}
            disabled={!isDirty || isSaving}
            className="min-w-[180px]"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isDirty ? (
              'Save changes'
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                All changes saved
              </>
            )}
          </Button>
        </div>
      )}
      
      {isOwner && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Permanently delete this company and all associated data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">Delete company</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Are you absolutely sure?</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete your
                    company and remove all associated data from our servers.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">
                    Type <span className="font-semibold">{company.name}</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirm"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={company.name}
                  />
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setDeleteDialogOpen(false)
                      setDeleteConfirmName('')
                    }}
                    disabled={isDeleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteCompany}
                    disabled={deleteConfirmName !== company.name || isDeleting}
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      'Delete company'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
