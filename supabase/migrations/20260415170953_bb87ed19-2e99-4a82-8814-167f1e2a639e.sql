CREATE POLICY "Admins can delete any activity"
ON public.lead_activities FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete any notification"
ON public.notifications FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete any campaign send"
ON public.whatsapp_campaign_sends FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete any trigger send"
ON public.whatsapp_trigger_sends FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete any scheduled message"
ON public.scheduled_whatsapp_messages FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));