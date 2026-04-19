import React, { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { addSessionCommentAsSub } from '@/lib/api/coach-quickview';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dimSessionId: number;
  athleteId: number;
  authorUserId?: number;
  onSuccess: () => void;
};

const MAX = 500;

export default function QuickViewCommentDialog({ open, onOpenChange, dimSessionId, athleteId, authorUserId, onSuccess }: Props) {
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await addSessionCommentAsSub({ dimSessionId, athleteId, body: body.trim(), authorUserId });
      toast({ title: 'Commentaire enregistré' });
      setBody('');
      onOpenChange(false);
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Erreur', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  const remaining = MAX - body.length;
  const isOverLimit = remaining < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ajouter un commentaire séance</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 py-1">
          <Label htmlFor="qv-comment" className="text-xs text-muted-foreground">
            Commentaire (max {MAX} car.)
          </Label>
          <Textarea
            id="qv-comment"
            rows={4}
            maxLength={MAX}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Observations sur la séance, points à transmettre au titulaire…"
            className="resize-none text-sm"
          />
          <p className={`text-[10px] text-right ${isOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
            {remaining} car. restants
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button size="sm" onClick={handleSubmit} disabled={saving || !body.trim() || isOverLimit}>
            {saving ? 'Enregistrement…' : 'Envoyer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
